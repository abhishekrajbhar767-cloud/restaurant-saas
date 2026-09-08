'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RestaurantStatus } from '@/types/database';
import { addDaysIso } from '@/lib/super-admin/subscription';

const DEFAULT_CATEGORIES = ['Starters', 'Main Course', 'Desserts', 'Drinks'];

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CreateRestaurantSchema = z.object({
  name: z.string().min(2, 'Restaurant name is required'),
  slug: z.string().min(2, 'Slug is required'),
  ownerName: z.string().min(2, "Owner's name is required"),
  ownerEmail: z.string().email('Enter a valid email address'),
  ownerPassword: z.string().min(6, 'Owner password must be at least 6 characters'),
  ownerPhone: z.string().optional(),
  currency: z.string().min(1, 'Currency is required'),
  timezone: z.string().min(1, 'Timezone is required'),
  logoUrl: z.union([z.string().url(), z.literal('')]).optional(),
  seedDefaultCategories: z.boolean().optional(),
});

export interface CreateRestaurantState {
  error?: string;
}

export async function createRestaurant(_prev: CreateRestaurantState, formData: FormData): Promise<CreateRestaurantState> {
  await requireSuperAdmin();

  const rawSlug = (formData.get('slug') as string) || slugify((formData.get('name') as string) ?? '');

  const parsed = CreateRestaurantSchema.safeParse({
    name: formData.get('name'),
    slug: slugify(rawSlug),
    ownerName: formData.get('ownerName'),
    ownerEmail: formData.get('ownerEmail'),
    ownerPassword: formData.get('ownerPassword'),
    ownerPhone: (formData.get('ownerPhone') as string) || undefined,
    currency: formData.get('currency') || 'INR',
    timezone: formData.get('timezone') || 'Asia/Kolkata',
    logoUrl: (formData.get('logoUrl') as string) || undefined,
    seedDefaultCategories: formData.get('seedDefaultCategories') === 'on',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  if (!SLUG_PATTERN.test(parsed.data.slug)) {
    return { error: 'Slug must be lowercase letters, numbers, and hyphens only.' };
  }

  const input = parsed.data;
  const supabase = createClient();

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .insert({
      name: input.name,
      slug: input.slug,
      currency: input.currency,
      timezone: input.timezone,
      logo_url: input.logoUrl || null,
    })
    .select()
    .single();

  if (restaurantError || !restaurant) {
    if (restaurantError?.code === '23505') {
      return { error: `The slug "${input.slug}" is already taken — try a different one.` };
    }
    console.error('createRestaurant: restaurant insert failed', restaurantError);
    return { error: 'Could not create the restaurant. Please try again.' };
  }

  // Creating the owner's auth account with a Super-Admin-supplied password needs
  // the Admin Auth API — the one legitimate use of the service-role client in
  // this app (see lib/supabase/admin.ts).
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.ownerEmail,
    password: input.ownerPassword,
    email_confirm: true,
    user_metadata: { name: input.ownerName },
  });

  if (createError || !created?.user) {
    console.error('createRestaurant: owner account creation failed', createError);
    revalidatePath('/super-admin');
    redirect(`/super-admin/restaurants/${restaurant.id}?ownerError=1`);
  }

  const { error: memberError } = await supabase.from('restaurant_members').insert({
    restaurant_id: restaurant.id,
    user_id: created.user.id,
    role: 'owner',
    display_name: input.ownerName,
    phone: input.ownerPhone || null,
  });

  if (memberError) {
    console.error('createRestaurant: owner membership insert failed', memberError);
    revalidatePath('/super-admin');
    redirect(`/super-admin/restaurants/${restaurant.id}?ownerError=1`);
  }

  if (input.seedDefaultCategories) {
    const { error: categoryError } = await supabase.from('menu_categories').insert(
      DEFAULT_CATEGORIES.map((name, i) => ({ restaurant_id: restaurant.id, name, sort_order: i + 1 }))
    );
    if (categoryError) console.error('createRestaurant: default category seed failed', categoryError);
  }

  revalidatePath('/super-admin');
  redirect(`/super-admin/restaurants/${restaurant.id}`);
}

export async function setRestaurantStatus(restaurantId: string, status: RestaurantStatus) {
  await requireSuperAdmin();
  const supabase = createClient();

  const { error } = await supabase.from('restaurants').update({ status }).eq('id', restaurantId);
  if (error) {
    console.error('setRestaurantStatus failed', error);
    throw new Error('Could not update restaurant status.');
  }

  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
}

const RetryOwnerSchema = z.object({
  restaurantId: z.string().uuid(),
  ownerName: z.string().min(2, "Owner's name is required"),
  ownerEmail: z.string().email('Enter a valid email address'),
  ownerPassword: z.string().min(6, 'Owner password must be at least 6 characters'),
  ownerPhone: z.string().optional(),
});

/** Used when the very first owner account creation failed at restaurant-creation time. */
export async function retryOwnerCreation(_prev: CreateRestaurantState, formData: FormData): Promise<CreateRestaurantState> {
  await requireSuperAdmin();

  const parsed = RetryOwnerSchema.safeParse({
    restaurantId: formData.get('restaurantId'),
    ownerName: formData.get('ownerName'),
    ownerEmail: formData.get('ownerEmail'),
    ownerPassword: formData.get('ownerPassword'),
    ownerPhone: (formData.get('ownerPhone') as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { restaurantId, ownerName, ownerEmail, ownerPassword, ownerPhone } = parsed.data;

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    user_metadata: { name: ownerName },
    email_confirm: true,
  });

  if (createError || !created?.user) {
    console.error('retryOwnerCreation: owner account creation failed', createError);
    return { error: 'Could not create that account — the email may already be registered.' };
  }

  const supabase = createClient();
  const { error: memberError } = await supabase.from('restaurant_members').insert({
    restaurant_id: restaurantId,
    user_id: created.user.id,
    role: 'owner',
    display_name: ownerName,
    phone: ownerPhone || null,
  });

  if (memberError) {
    return { error: 'Account created, but could not attach the owner role. Contact support.' };
  }

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(`/super-admin/restaurants/${restaurantId}`);
}

const ReplaceOwnerSchema = z.object({
  restaurantId: z.string().uuid(),
  ownerName: z.string().min(2, "Owner's name is required"),
  ownerEmail: z.string().email('Enter a valid email address'),
  ownerPassword: z.string().min(6, 'Owner password must be at least 6 characters'),
  ownerPhone: z.string().optional(),
});

export interface ReplaceOwnerState {
  error?: string;
}

export async function replaceOwner(_prev: ReplaceOwnerState, formData: FormData): Promise<ReplaceOwnerState> {
  await requireSuperAdmin();

  const parsed = ReplaceOwnerSchema.safeParse({
    restaurantId: formData.get('restaurantId'),
    ownerName: formData.get('ownerName'),
    ownerEmail: formData.get('ownerEmail'),
    ownerPassword: formData.get('ownerPassword'),
    ownerPhone: (formData.get('ownerPhone') as string) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { restaurantId, ownerName, ownerEmail, ownerPassword, ownerPhone } = parsed.data;

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    user_metadata: { name: ownerName },
    email_confirm: true,
  });

  if (createError || !created?.user) {
    console.error('replaceOwner: owner account creation failed', createError);
    return { error: 'Could not create that account — the email may already be registered.' };
  }

  const supabase = createClient();

  // Deactivate the current owner membership(s) before attaching the new one,
  // so a restaurant never briefly has two active owners.
  const { error: deactivateError } = await supabase
    .from('restaurant_members')
    .update({ is_active: false })
    .eq('restaurant_id', restaurantId)
    .eq('role', 'owner');

  if (deactivateError) {
    console.error('replaceOwner: deactivate failed', deactivateError);
    return { error: 'Could not deactivate the current owner. Please try again.' };
  }

  const { error: memberError } = await supabase.from('restaurant_members').insert({
    restaurant_id: restaurantId,
    user_id: created.user.id,
    role: 'owner',
    display_name: ownerName,
    phone: ownerPhone || null,
  });

  if (memberError) {
    console.error('replaceOwner: new owner membership failed', memberError);
    return { error: 'Account created, but could not attach the owner role. Contact support.' };
  }

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(`/super-admin/restaurants/${restaurantId}`);
}

export interface SuperAdminActionState {
  error?: string;
  success?: string;
}

const ResetOwnerPasswordSchema = z.object({
  restaurantId: z.string().uuid(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm: z.string().min(6, 'Confirm the new password'),
});

export async function resetOwnerPassword(
  _prev: SuperAdminActionState,
  formData: FormData
): Promise<SuperAdminActionState> {
  await requireSuperAdmin();

  const parsed = ResetOwnerPasswordSchema.safeParse({
    restaurantId: formData.get('restaurantId'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { restaurantId, password, confirm } = parsed.data;
  if (password !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = createClient();

  const { data: owner, error: ownerError } = await supabase
    .from('restaurant_members')
    .select('user_id')
    .eq('restaurant_id', restaurantId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownerError) {
    console.error('resetOwnerPassword: owner lookup failed', ownerError);
    return { error: 'Could not look up the restaurant owner.' };
  }
  if (!owner?.user_id) {
    return { error: 'This restaurant has no active owner to reset.' };
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(owner.user_id, { password });

  if (updateError) {
    console.error('resetOwnerPassword: Auth Admin update failed', updateError);
    return { error: 'Could not update the owner password. Please try again.' };
  }

  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  return { success: 'Password updated. Share it with the owner directly — it is not stored or emailed.' };
}

const PLAN_TYPES = ['free_trial', 'monthly', 'yearly'] as const;

const UpdateRestaurantPlanSchema = z.object({
  restaurantId: z.string().uuid(),
  planType: z.enum(PLAN_TYPES),
  days: z.coerce.number().int().min(1).max(3650).optional(),
  exactAt: z.string().optional(),
});

export async function updateRestaurantPlan(
  _prev: SuperAdminActionState,
  formData: FormData
): Promise<SuperAdminActionState> {
  await requireSuperAdmin();

  const daysRaw = (formData.get('days') as string | null)?.trim() ?? '';
  const exactRaw = (formData.get('exactAt') as string | null)?.trim() ?? '';

  const parsed = UpdateRestaurantPlanSchema.safeParse({
    restaurantId: formData.get('restaurantId'),
    planType: formData.get('planType'),
    days: daysRaw ? daysRaw : undefined,
    exactAt: exactRaw || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { restaurantId, planType } = parsed.data;

  if (!parsed.data.days && !parsed.data.exactAt) {
    return { error: 'Enter a number of days or an exact expiry date.' };
  }

  const supabase = createClient();
  const { data: existing, error: existingError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (existingError) {
    console.error('updateRestaurantPlan: load failed', existingError);
    return { error: 'Could not load the current subscription.' };
  }

  let targetIso: string;
  if (parsed.data.exactAt) {
    const exact = new Date(parsed.data.exactAt);
    if (Number.isNaN(exact.getTime())) {
      return { error: 'Enter a valid expiry date and time.' };
    }
    targetIso = exact.toISOString();
  } else {
    const extendFrom = existing?.subscription_expires_at ?? existing?.expires_at ?? existing?.trial_ends_at ?? null;
    targetIso = addDaysIso(extendFrom, parsed.data.days ?? 0);
  }

  const isTrial = planType === 'free_trial';
  const trialEndsAt = isTrial ? targetIso : existing?.trial_ends_at ?? null;
  const expiresAt = isTrial ? existing?.expires_at ?? null : targetIso;

  const payload = {
    restaurant_id: restaurantId,
    plan_type: planType,
    trial_ends_at: trialEndsAt,
    expires_at: expiresAt,
    subscription_expires_at: targetIso,
  };

  const { error: writeError } = existing
    ? await supabase.from('subscriptions').update(payload).eq('restaurant_id', restaurantId)
    : await supabase.from('subscriptions').insert(payload);

  if (writeError) {
    console.error('updateRestaurantPlan: write failed', writeError);
    return { error: 'Could not update the plan. Please try again.' };
  }

  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  return { success: 'Plan updated.' };
}
