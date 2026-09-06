// middleware.ts
//
// Middleware does two jobs only:
//  1. Keep the Supabase session cookie fresh (updateSession).
//  2. Bounce unauthenticated visitors away from staff areas before a page
//     even renders, for a snappy UX.
//
// It deliberately does NOT decide *which* role can see *which* page — that
// fine-grained check lives in lib/auth/session.ts (requireRole /
// requireSuperAdmin), which is re-verified against restaurant_members on
// every request to those layouts, and is backed underneath by RLS regardless.
// Middleware can't see role data without an extra round trip on every request,
// and getting that wrong here would be exactly the "hiding UI elements"
// anti-pattern the spec calls out.
//
// /admin/super is an alias; next.config redirects it to /super-admin, which
// is gated here (login) and then by requireSuperAdmin() in the layout.

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PROTECTED_PREFIXES = ['/super-admin', '/admin', '/kitchen', '/waiter'];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and the customer-facing menu
     * (which must stay fast and fully public for anonymous QR visitors).
     */
    '/((?!_next/static|_next/image|favicon.ico|menu/).*)',
  ],
};
