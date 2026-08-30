// lib/supabase/middleware.ts
// Refreshes the Supabase auth session on every request so server components
// always see a valid (or correctly expired) cookie. This file does NOT do
// authorization — it only keeps the session alive. Role checks happen in
// lib/auth/session.ts, called from each protected area's layout.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // touch the session so expired/near-expired tokens get refreshed
  const { data: { user } } = await supabase.auth.getUser();

  return { response, user };
}
