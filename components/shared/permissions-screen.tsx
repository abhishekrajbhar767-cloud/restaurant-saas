'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveEntryRoute } from '@/app/permissions/actions';
import {
  allSatisfied,
  checkRequiredPermissions,
  isSatisfied,
  openAppSettings,
  requestPermission,
  type PermissionKind,
  type PermissionSnapshot,
  type PermissionState,
} from '@/lib/native/device-permissions';

const COPY: Record<PermissionKind, { label: string; why: string; grantLabel: string }> = {
  location: {
    label: 'Location',
    why: 'Confirms you are physically at the restaurant when you clock in, so geofenced shifts record honest attendance.',
    grantLabel: 'Grant location access',
  },
  notifications: {
    label: 'Notifications',
    why: 'Delivers new order and table-call alerts the moment they happen, even when the app is in the background.',
    grantLabel: 'Grant notification access',
  },
  battery: {
    label: 'Background Battery',
    why: 'Stops Android from freezing the app during a shift. Without it, alerts arrive late or not at all.',
    grantLabel: 'Allow unrestricted background use',
  },
  camera: {
    label: 'Camera',
    why: 'Camera access is required to scan table QR codes.',
    grantLabel: 'Grant camera access',
  },
};

export function PermissionsScreen() {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<PermissionSnapshot[] | null>(null);
  const [busyKind, setBusyKind] = useState<PermissionKind | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<PermissionSnapshot[]> => {
    const next = await checkRequiredPermissions();
    setSnapshots(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Battery optimization and the "permanently denied" fallback both hand the
  // user off to a system Settings screen. Re-reading state when the app comes
  // back to the foreground means they usually return to a card that has
  // already turned green, instead of having to hunt for a button.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void refresh();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  async function handleCardAction(kind: PermissionKind, state: PermissionState) {
    if (busyKind || rechecking) return;
    setBusyKind(kind);
    setNotice(null);

    if (state === 'denied') {
      const opened = await openAppSettings();
      if (!opened) {
        setNotice(
          `Could not open Settings automatically. Open Settings → Apps → Restaurant OS → Permissions and enable ${COPY[kind].label} by hand.`
        );
      }
    } else {
      const next = await requestPermission(kind);
      setSnapshots((prev) => (prev ? prev.map((s) => (s.kind === kind ? { ...s, state: next } : s)) : prev));
    }

    setBusyKind(null);
  }

  async function handleRecheck() {
    if (busyKind || rechecking) return;
    setRechecking(true);
    setNotice(null);

    const next = await refresh();
    if (!allSatisfied(next)) {
      setRechecking(false);
      const pending = next.filter((s) => !isSatisfied(s.state)).map((s) => COPY[s.kind].label);
      setNotice(`Still waiting on: ${pending.join(', ')}.`);
      return;
    }

    const destination = await resolveEntryRoute();
    router.replace(destination);
  }

  const ready = snapshots !== null && allSatisfied(snapshots);

  return (
    <div className="min-h-screen bg-ink-950 px-5 py-10">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-2xl font-bold">Required Permissions</h1>
        <p className="mt-2 text-sm text-text-muted">
          Restaurant OS runs your floor in real time. These three permissions are mandatory — without them, kitchen
          alerts go silent and geofenced shifts cannot verify you are on site.
        </p>

        <div className="mt-6 space-y-3">
          {snapshots === null
            ? [0, 1, 2].map((i) => <div key={i} className="card h-[116px] animate-pulse opacity-40" aria-hidden />)
            : snapshots.map(({ kind, state }) => {
                const copy = COPY[kind];
                const granted = isSatisfied(state);
                const busy = busyKind === kind;

                return (
                  <section key={kind} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-display text-sm font-bold">{copy.label}</h2>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted">{copy.why}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-display font-bold uppercase tracking-wide ${
                          granted ? 'bg-success/15 text-success' : 'bg-amber/15 text-amber'
                        }`}
                      >
                        {granted ? 'Granted' : 'Action Required'}
                      </span>
                    </div>

                    {!granted && (
                      <button
                        type="button"
                        onClick={() => void handleCardAction(kind, state)}
                        disabled={busy || rechecking}
                        className="btn-primary mt-3 w-full py-2.5 text-sm"
                      >
                        {busy ? 'Opening…' : state === 'denied' ? 'Open App Settings' : copy.grantLabel}
                      </button>
                    )}

                    {!granted && state === 'denied' && (
                      <p className="mt-2 text-[11px] leading-relaxed text-danger">
                        Android has blocked this prompt. Enable {copy.label} under Settings → Apps → Restaurant OS →
                        Permissions, then come back and re-check.
                      </p>
                    )}
                  </section>
                );
              })}
        </div>

        {notice && (
          <p role="alert" className="mt-4 rounded border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
            {notice}
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleRecheck()}
          disabled={rechecking || busyKind !== null || snapshots === null}
          className="btn-primary mt-6 w-full py-4 text-base font-bold"
        >
          {rechecking ? 'Checking…' : ready ? 'Continue' : 'Recheck & Continue'}
        </button>

        <p className="mt-3 text-center text-[11px] text-text-muted">
          You can change these any time in your phone&rsquo;s app settings.
        </p>
      </div>
    </div>
  );
}
