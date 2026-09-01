'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MemberRole } from '@/types/database';

async function requireTenant() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) throw new Error('No restaurant membership found.');
  return { ctx, restaurantId };
}

const AddStaffSchema = z.object({
  name: z.string().min(2, "Staff member's name is required"),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional(),
  role: z.enum(['manager', 'kitchen', 'waiter']),
});

export async function addStaff(formData: FormData) {
  const { ctx, restaurantId } = await requireTenant();

  const parsed = AddStaffSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    phone: formData.get('phone') || undefined,
    role: formData.get('role'),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');

  // Managers can only bring on kitchen/waiter staff — the DB (RLS policy
  // members_insert_manager) enforces this independently; this check just
  // gives a clean error message instead of a raw RLS rejection.
  const actingRole = ctx.tenantMembership?.role as MemberRole;
  if (actingRole === 'manager' && parsed.data.role === 'manager') {
    throw new Error('Only the owner can add another manager.');
  }

  // Creating the staff account with a password needs the Admin Auth API —
  // the account is created instantly active, no email invite/verification.
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    user_metadata: { name: parsed.data.name },
    email_confirm: true,
  });
  if (createError || !created?.user) {
    throw new Error('Could not create that account — the email may already be registered.');
  }

  const supabase = createClient();
  const { error: memberError } = await supabase.from('restaurant_members').insert({
    restaurant_id: restaurantId,
    user_id: created.user.id,
    role: parsed.data.role as MemberRole,
    display_name: parsed.data.name,
    phone: parsed.data.phone || null,
  });
  if (memberError) throw new Error('Account created, but could not assign the role. Contact support.');

  revalidatePath('/admin/staff');
}

export async function setStaffActive(memberId: string, isActive: boolean) {
  await requireTenant();
  const supabase = createClient();
  // Scoped by RLS to rows the caller may touch — an owner can toggle anyone
  // on their team, a manager only kitchen/waiter rows (members_update_manager_staff).
  const { error } = await supabase.from('restaurant_members').update({ is_active: isActive }).eq('id', memberId);
  if (error) throw new Error('Could not update that staff member — you may not have permission.');

  revalidatePath('/admin/staff');
}
