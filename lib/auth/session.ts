import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ROLE_HOME_ROUTE } from '@/lib/auth/roles';
import type { MemberRole, Restaurant, RestaurantMember } from '@/types/database';

export interface TenantMembership extends RestaurantMember {
  restaurant: Restaurant;
}

export interface UserContext {
  userId: string;
  email: string | null;
  isSuperAdmin: boolean;
  tenantMembership: TenantMembership | null;
}

export async function getUserContext(): Promise<UserContext | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: memberships, error } = await supabase
    .from('restaurant_members')
    .select('*, restaurant:restaurants(*)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .returns<(RestaurantMember & { restaurant: Restaurant })[]>();

  if (error) {
    console.error('Failed to load restaurant_members for user', user.id, error);
    return { userId: user.id, email: user.email ?? null, isSuperAdmin: false, tenantMembership: null };
  }

  const rows = memberships ?? [];
  const isSuperAdmin = rows.some((m) => m.role === 'super_admin');
  const tenantRow = rows.find((m) => m.restaurant_id !== null) as
    | (RestaurantMember & { restaurant: Restaurant })
    | undefined;

  return {
    userId: user.id,
    email: user.email ?? null,
    isSuperAdmin,
    tenantMembership: tenantRow ? (tenantRow as TenantMembership) : null,
  };
}

export async function requireRole(allowed: MemberRole[]): Promise<UserContext> {
  const ctx = await getUserContext();

  if (!ctx) {
    redirect('/auth/login');
  }

  if (ctx.isSuperAdmin) {
    return ctx;
  }

  const role = ctx.tenantMembership?.role;
  if (!role || !allowed.includes(role)) {
    redirect('/unauthorized');
  }

  return ctx;
}

export function homeRouteFor(ctx: UserContext): string {
  if (ctx.isSuperAdmin) return ROLE_HOME_ROUTE.super_admin;
  if (ctx.tenantMembership) return ROLE_HOME_ROUTE[ctx.tenantMembership.role];
  return '/unauthorized';
}