'use server';

import { getUserContext, homeRouteFor } from '@/lib/auth/session';

/**
 * Where a staff member belongs once every required permission is satisfied:
 * their role's dashboard if the session cookie is still valid, otherwise the
 * login screen. Resolved on the server because the permissions screen itself
 * is public — it renders before we know who (if anyone) is signed in.
 */
export async function resolveEntryRoute(): Promise<string> {
  const ctx = await getUserContext();
  if (!ctx) return '/auth/login';
  return homeRouteFor(ctx);
}
