'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clockIn, clockOut } from '@/app/staff/actions';
import { distanceMeters, formatDistance, getCurrentPosition } from '@/lib/shared/geolocation';
import type { Restaurant, StaffShift } from '@/types/database';

export function ShiftClock({
  restaurant,
  openShift,
  recentShifts,
  displayName,
}: {
  restaurant: Restaurant;
  openShift: StaffShift | null;
  recentShifts: StaffShift[];
  displayName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const geofenced = restaurant.latitude !== null && restaurant.longitude !== null;
  const radius = restaurant.geofence_radius_meters ?? 0;

  useEffect(() => {
    if (!openShift) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openShift]);

  async function handleClockIn() {
    setBusy(true);
    setError(null);
    setStatus(null);

    let coords: { latitude: number; longitude: number } | null = null;

    if (geofenced) {
      setStatus('Checking your location…');
      const result = await getCurrentPosition();

      if ('error' in result) {
        setError(result.error);
        setStatus(null);
        setBusy(false);
        return;
      }

      coords = { latitude: result.coords.latitude, longitude: result.coords.longitude };

      // Same check the database will run. Doing it here just turns a rejected
      // round trip into an immediate, specific explanation.
      const away = distanceMeters(
        result.coords.latitude,
        result.coords.longitude,
        restaurant.latitude!,
        restaurant.longitude!
      );
      if (away > radius) {
        setError(
          `You are ${formatDistance(away)} from ${restaurant.name}. Clock-in is allowed within ${radius} m.`
        );
        setStatus(null);
        setBusy(false);
        return;
      }
    }

    setStatus('Clocking in…');
    const { error: actionError } = await clockIn(coords);
    setBusy(false);
    setStatus(null);

    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
  }

  async function handleClockOut() {
    setBusy(true);
    setError(null);
    setStatus('Clocking out…');

    const { error: actionError } = await clockOut();
    setBusy(false);
    setStatus(null);

    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">My Shift</h1>
        <p className="text-sm text-text-muted">
          {displayName} · {restaurant.name}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <section className="card p-5 text-center">
        {openShift ? (
          <>
            <span className="inline-flex items-center gap-2 text-xs text-success">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden />
              On shift
            </span>
            <p className="mt-3 font-display text-4xl font-bold tabular-nums">{elapsed(openShift.clock_in_time, now)}</p>
            <p className="mt-1 text-xs text-text-muted">Since {formatTime(openShift.clock_in_time)}</p>

            <button
              onClick={handleClockOut}
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-danger py-4 font-display text-lg font-bold text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? status ?? 'Working…' : 'Clock Out'}
            </button>
          </>
        ) : (
          <>
            <span className="text-xs uppercase tracking-wide text-text-muted">Off shift</span>
            <p className="mt-2 text-sm text-text-muted">
              {geofenced
                ? `You must be within ${radius} m of ${restaurant.name} to clock in.`
                : 'No location restriction is set for this restaurant.'}
            </p>

            <button
              onClick={handleClockIn}
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-success py-4 font-display text-lg font-bold text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? status ?? 'Working…' : 'Clock In'}
            </button>

            {geofenced && (
              <p className="mt-2 text-[11px] text-text-muted">Your browser will ask for location permission.</p>
            )}
          </>
        )}
      </section>

      {recentShifts.length > 0 && (
        <section className="card p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-text-muted">Recent shifts</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {recentShifts.map((shift) => (
              <li key={shift.id} className="flex items-center justify-between py-2">
                <span className="text-text-muted">{formatDate(shift.clock_in_time)}</span>
                <span className="font-mono text-xs">
                  {formatTime(shift.clock_in_time)} → {shift.clock_out_time ? formatTime(shift.clock_out_time) : '—'}
                </span>
                <span className="font-mono text-xs text-text-muted">
                  {shift.clock_out_time ? elapsed(shift.clock_in_time, new Date(shift.clock_out_time).getTime()) : 'open'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function elapsed(from: string, to: number): string {
  const ms = Math.max(to - new Date(from).getTime(), 0);
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
