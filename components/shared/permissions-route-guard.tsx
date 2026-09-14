'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { allSatisfied, checkRequiredPermissions } from '@/lib/native/device-permissions';

// Paths that must stay reachable even while permissions are missing:
// the permissions screen itself, and the customer QR menu (anonymous diners
// are not staff and have no native app to grant anything in).
const UNGATED_PREFIXES = ['/permissions', '/menu'];

function isUngated(pathname: string): boolean {
  return UNGATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Resolved once per app launch. This is an in-memory module variable, never
// localStorage — a reinstall, a cleared profile, or simply relaunching the
// app starts it back at null, so the real OS state gets read again. It only
// exists so client-side navigations inside a single session don't re-query
// the bridge on every route change.
let verifiedThisLaunch = false;

/**
 * The unconditional gate. On a native build, nothing behind it renders until
 * Location, Notifications and Background Battery are all satisfied — that
 * includes /auth/login, so a staff member cannot even sign in first and get
 * stuck with a half-working app.
 *
 * On the web this is a pure pass-through: battery optimization has no browser
 * equivalent, and blocking every desktop manager behind a permission screen
 * they cannot satisfy would lock them out of their own dashboard.
 */
export function PermissionsRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const native = Capacitor.isNativePlatform();
  const gated = native && !isUngated(pathname);

  const [allowed, setAllowed] = useState(() => !gated || verifiedThisLaunch);

  useEffect(() => {
    if (!gated || verifiedThisLaunch) {
      setAllowed(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const snapshots = await checkRequiredPermissions();
      if (cancelled) return;

      if (allSatisfied(snapshots)) {
        verifiedThisLaunch = true;
        setAllowed(true);
        return;
      }
      router.replace('/permissions');
    })();

    return () => {
      cancelled = true;
    };
  }, [gated, pathname, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <p className="text-sm text-text-muted">Checking device permissions…</p>
      </div>
    );
  }

  return <>{children}</>;
}
