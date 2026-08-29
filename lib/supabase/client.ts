// lib/supabase/client.ts
// Used only inside Client Components (customer menu, cart, realtime
// subscriptions, waiter/KDS live updates). Always uses the anon key —
// authorization is enforced by RLS + the RPC functions on the database side,
// never by anything in this file.

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
