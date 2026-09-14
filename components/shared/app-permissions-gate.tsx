'use client';

import { useEffect, useState } from 'react';
import { checkPermission, requestPermission, type PermissionKind, type PermissionState } from '@/lib/native/device-permissions';

const PERMISSION_COPY: Record<PermissionKind, { label: string; message: string }> = {
  location: {
    label: 'Location',
    message: 'Needed to confirm you’re on site when you clock in, if this restaurant has a geofence set.',
  },
  camera: {
    label: 'Camera',
    message: 'Camera access is required to scan table QR codes.',
  },
  notifications: {
    label: 'Notifications',
    message: 'Needed so you don’t miss a new order or a table calling for a waiter while the app is in the background.',
  },
};

// Camera has no real usage in this app yet (no in-app QR scanning exists) —
// gating every layout on it would just be friction with no feature behind
// it. The checker still knows how to read/request it (PERMISSION_COPY and
// device-permissions.ts both support it in full) so a caller can opt in the
// moment a camera feature actually ships, without touching this file.
const DEFAULT_REQUIRED: PermissionKind[] = ['location', 'notifications'];

type Row = { kind: PermissionKind; state: PermissionState };

export function AppPermissionsGate({
  children,
  required = DEFAULT_REQUIRED,
}: {
  children: React.ReactNode;
  required?: PermissionKind[];
}) {
  // null = still reading actual OS/browser state on mount. This is never
  // seeded from localStorage or any other cached flag — every mount re-asks
  // the platform directly, which is what makes a reinstall or a revoked
  // permission show up immediately instead of being masked by a stale flag.
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyKind, setBusyKind] = useState<PermissionKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(required.map(async (kind) => ({ kind, state: await checkPermission(kind) }))).then((results) => {
      if (!cancelled) setRows(results);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- required is meant to be a stable literal per call site
  }, []);

  async function handleGrant(kind: PermissionKind) {
    if (busyKind) return;
    setBusyKind(kind);
    const state = await requestPermission(kind);
    setBusyKind(null);
    setRows((prev) => (prev ? prev.map((row) => (row.kind === kind ? { ...row, state } : row)) : prev));
  }

  if (rows === null) {
    // Brief — these are just permission-status reads, not network calls —
    // but still needs a frame so nothing flashes before it resolves.
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-text-muted">Checking app permissions…</p>
      </div>
    );
  }

  const missing = rows.filter((row) => row.state !== 'granted' && row.state !== 'unsupported');
  if (missing.length === 0) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <div>
        <h1 className="font-display text-xl font-bold">App Permissions Needed</h1>
        <p className="mt-1 text-sm text-text-muted">
          Restaurant OS needs a few device permissions before you can get to work.
        </p>
      </div>

      <div className="space-y-3">
        {missing.map((row) => {
          const copy = PERMISSION_COPY[row.kind];
          const busy = busyKind === row.kind;
          const blocked = row.state === 'denied';

          return (
            <div key={row.kind} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold">{copy.label}</p>
                  <p className="mt-0.5 text-xs text-text-muted">{copy.message}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    blocked ? 'bg-danger/15 text-danger' : 'bg-amber/15 text-amber'
                  }`}
                >
                  {blocked ? 'Blocked' : 'Needed'}
                </span>
              </div>

              {blocked ? (
                <p className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {copy.label} is blocked at the OS level, so this app can no longer ask directly. Open your phone&rsquo;s{' '}
                  <span className="font-medium">Settings → Apps → Restaurant OS → Permissions</span> and enable{' '}
                  {copy.label} manually, then come back here.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => handleGrant(row.kind)}
                  disabled={busy}
                  className="btn-primary mt-3 w-full py-2.5 text-sm disabled:opacity-60"
                >
                  {busy ? 'Requesting…' : `Grant ${copy.label} access`}
                </button>
              )}

              {blocked && (
                <button
                  type="button"
                  onClick={() => handleGrant(row.kind)}
                  disabled={busy}
                  className="btn-secondary mt-2 w-full py-2 text-xs disabled:opacity-60"
                >
                  {busy ? 'Checking…' : "I've enabled it — check again"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
