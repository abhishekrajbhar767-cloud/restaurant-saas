// lib/supabase/server.ts
// Used inside Server Components, Server Actions, and Route Handlers.
// Reads/writes the auth cookie via next/headers so the logged-in user's
// session — and therefore auth.uid() inside RLS/RPC on the database — is
// always the real session, never a client-asserted identity.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component render — middleware refreshes
            // the session cookie on the next request, so this is safe to ignore.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // See note above.
          }
        },
      },
    }
  );
}
