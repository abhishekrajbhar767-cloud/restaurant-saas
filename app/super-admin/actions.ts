'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RestaurantStatus } from '@/types/database';

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
  await requireRole(['super_admin']);

  const rawSlug = (formData.get('slug') as string) || slugify((formData.get('name') as string) ?? '');

  const parsed = CreateRestaurantSchema.safeParse({
    name: formData.get('name'),
    slug: slugify(rawSlug),
    ownerName: formData.get('ownerName'),
    ownerEmail: formData.get('ownerEmail'),
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

  // Inviting the owner's auth account needs the Admin Auth API — the one
  // legitimate use of the service-role client in this app (see lib/supabase/admin.ts).
  const admin = createAdminClient();
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.ownerEmail, {
    data: { name: input.ownerName },
  });

  if (inviteError || !invite?.user) {
    console.error('createRestaurant: owner invite failed', inviteError);
    revalidatePath('/super-admin');
    redirect(`/super-admin/restaurants/${restaurant.id}?ownerInviteError=1`);
  }

  const { error: memberError } = await supabase.from('restaurant_members').insert({
    restaurant_id: restaurant.id,
    user_id: invite.user.id,
    role: 'owner',
    display_name: input.ownerName,
    phone: input.ownerPhone || null,
  });

  if (memberError) {
    console.error('createRestaurant: owner membership insert failed', memberError);
    revalidatePath('/super-admin');
    redirect(`/super-admin/restaurants/${restaurant.id}?ownerInviteError=1`);
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
  await requireRole(['super_admin']);
  const supabase = createClient();

  const { error } = await supabase.from('restaurants').update({ status }).eq('id', restaurantId);
  if (error) {
    console.error('setRestaurantStatus failed', error);
    throw new Error('Could not update restaurant status.');
  }

  revalidatePath('/super-admin');
  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
}

export async function retryOwnerInvite(_prev: CreateRestaurantState, formData: FormData): Promise<CreateRestaurantState> {
  await requireRole(['super_admin']);

  const restaurantId = formData.get('restaurantId') as string;
  const ownerName = formData.get('ownerName') as string;
  const ownerEmail = formData.get('ownerEmail') as string;
  const ownerPhone = (formData.get('ownerPhone') as string) || undefined;

  if (!restaurantId || !ownerName || !ownerEmail) {
    return { error: 'Missing required fields.' };
  }

  const admin = createAdminClient();
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
    data: { name: ownerName },
  });

  if (inviteError || !invite?.user) {
    return { error: 'Could not send the invite — that email may already be registered.' };
  }

  const supabase = createClient();
  const { error: memberError } = await supabase.from('restaurant_members').insert({
    restaurant_id: restaurantId,
    user_id: invite.user.id,
    role: 'owner',
    display_name: ownerName,
    phone: ownerPhone || null,
  });

  if (memberError) {
    return { error: 'Invite sent, but could not attach the owner role. Contact support.' };
  }

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(`/super-admin/restaurants/${restaurantId}`);
}

const ReplaceOwnerSchema = z.object({
  restaurantId: z.string().uuid(),
  ownerName: z.string().min(2, "Owner's name is required"),
  ownerEmail: z.string().email('Enter a valid email address'),
  ownerPhone: z.string().optional(),
});

export interface ReplaceOwnerState {
  error?: string;
}

export async function replaceOwner(_prev: ReplaceOwnerState, formData: FormData): Promise<ReplaceOwnerState> {
  await requireRole(['super_admin']);

  const parsed = ReplaceOwnerSchema.safeParse({
    restaurantId: formData.get('restaurantId'),
    ownerName: formData.get('ownerName'),
    ownerEmail: formData.get('ownerEmail'),
    ownerPhone: (formData.get('ownerPhone') as string) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { restaurantId, ownerName, ownerEmail, ownerPhone } = parsed.data;

  const admin = createAdminClient();
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
    data: { name: ownerName },
  });

  if (inviteError || !invite?.user) {
    return { error: 'Could not invite that email — it may already be registered.' };
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
    user_id: invite.user.id,
    role: 'owner',
    display_name: ownerName,
    phone: ownerPhone || null,
  });

  if (memberError) {
    console.error('replaceOwner: new owner membership failed', memberError);
    return { error: 'Invite sent, but could not attach the owner role. Contact support.' };
  }

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(`/super-admin/restaurants/${restaurantId}`);
}
