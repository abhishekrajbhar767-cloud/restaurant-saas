// lib/supabase/admin.ts
//
// Service-role client. Use this ONLY for the narrow set of operations that
// genuinely require it — in this app, that's exactly one thing: inviting a
// new restaurant owner's auth.users account via the Admin Auth API, which
// has no RLS-scoped equivalent. Every other Super Admin action (creating a
// restaurant row, updating status, attaching a membership) already works
// through the ordinary server client because the RLS policies in
// 0005_rls_policies.sql grant super_admin full access — reach for
// lib/supabase/server.ts first, and only drop to this file when the
// operation is impossible under RLS.
//
// NEVER import this file into a Client Component or any code path that
// runs in the browser. It is only ever called from Server Actions.

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — required for owner invitations.');
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
