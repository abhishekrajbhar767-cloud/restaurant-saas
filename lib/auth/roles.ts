// lib/auth/roles.ts

import type { MemberRole } from '@/types/database';

// Section 39: where a role lands immediately after login.
// This is a UX convenience only — it is NOT what makes a route safe.
// Every protected layout re-derives the role server-side (lib/auth/session.ts)
// and RLS re-derives it again at the database. A wrong redirect here can only
// cause a bounce to /unauthorized, never a data leak.
export const ROLE_HOME_ROUTE: Record<MemberRole, string> = {
  super_admin: '/super-admin',
  owner: '/admin',
  manager: '/admin',
  kitchen: '/kitchen',
  waiter: '/waiter',
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  super_admin: 'Super Admin',
  owner: 'Owner',
  manager: 'Manager',
  kitchen: 'Kitchen',
  waiter: 'Waiter',
};

export function roleAllows(role: MemberRole, allowed: MemberRole[]): boolean {
  return allowed.includes(role);
}
