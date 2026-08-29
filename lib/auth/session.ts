// lib/auth/session.ts
//
// This is the ONE place route layouts ask "who is this and what can they see".
// It re-derives everything from the database on every call — nothing here
// trusts a cookie value, a URL segment, or anything the client asserts beyond
// "this is my session token". RLS enforces the same restaurant_members truth
// independently at the query level, so even a bug here can't leak tenant data
// — it can only mis-route a user to a page that then returns nothing useful.

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
  /** The user's active membership at a single tenant restaurant, if any. */
  tenantMembership: TenantMembership | null;
}

/** Returns null if there is no logged-in user. Never throws for "not logged in". */
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
    .eq('is_active', true);

  if (error) {
    // Fail closed: if we can't verify membership, treat as no access rather
    // than defaulting to any particular role.
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

/**
 * Guards a protected area. Redirects to /auth/login if unauthenticated, or
 * /unauthorized if authenticated but not permitted. Super Admin always
 * passes (mirrors the database: auth_is_super_admin() short-circuits every
 * RLS policy) — real access to tenant data en route to /admin, /kitchen or
 * /waiter as Super Admin is expected to go through Support Mode (section 27).
 */
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

/** Used by the post-login redirect and the root page. */
export function homeRouteFor(ctx: UserContext): string {
  if (ctx.isSuperAdmin) return ROLE_HOME_ROUTE.super_admin;
  if (ctx.tenantMembership) return ROLE_HOME_ROUTE[ctx.tenantMembership.role];
  return '/unauthorized';
}
