'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { clockOut } from '@/app/staff/actions';
import { distanceMeters, formatDistance } from '@/lib/shared/geolocation';
import { ROLE_LABEL } from '@/lib/auth/roles';
import type { ActiveShiftRow, Restaurant } from '@/types/database';

export function AttendancePanel({ restaurant }: { restaurant: Restaurant }) {
  const [shifts, setShifts] = useState<ActiveShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('get_active_shifts', { p_restaurant_id: restaurant.id });

    if (rpcError) {
      setError('Could not load attendance.');
      setLoading(false);
      return;
    }
    setShifts((data ?? []) as ActiveShiftRow[]);
    setError(null);
    setLoading(false);
  }, [restaurant.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any clock-in or clock-out anywhere in this restaurant refetches, so the
  // list matches the floor without the manager reloading the page.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`attendance-${restaurant.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_shifts', filter: `restaurant_id=eq.${restaurant.id}` },
        () => void load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurant.id, load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleForceClockOut(shift: ActiveShiftRow) {
    const who = shift.display_name ?? shift.email;
    if (!window.confirm(`Clock out ${who}? This closes their shift now.`)) return;

    setBusyId(shift.shift_id);
    setError(null);
    const { error: actionError } = await clockOut(shift.shift_id);
    setBusyId(null);

    if (actionError) {
      setError(actionError);
      return;
    }
    await load();
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-lg font-bold">Active Shifts</h2>
          <p className="text-xs text-text-muted">Who is clocked in right now.</p>
        </div>
        <span className={`text-xs font-medium ${shifts.length > 0 ? 'text-success' : 'text-text-muted'}`}>
          {shifts.length} on shift
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">Loading attendance…</p>
      ) : shifts.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Nobody is clocked in.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {shifts.map((shift) => (
            <li key={shift.shift_id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{shift.display_name ?? shift.email}</p>
                <p className="truncate text-[11px] text-text-muted">
                  {ROLE_LABEL[shift.role]} · in at {formatTime(shift.clock_in_time)}
                  {distanceLabel(shift, restaurant)}
                </p>
              </div>

              <span className="shrink-0 font-mono text-sm text-success">{duration(shift.clock_in_time, now)}</span>

              <button
                type="button"
                onClick={() => handleForceClockOut(shift)}
                disabled={busyId === shift.shift_id}
                className="shrink-0 text-xs text-danger underline underline-offset-2 disabled:opacity-50"
              >
                {busyId === shift.shift_id ? 'Closing…' : 'Clock out'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Where they were standing when they clocked in, relative to the restaurant.
// Only meaningful once a geofence exists and the shift actually captured a fix.
function distanceLabel(shift: ActiveShiftRow, restaurant: Restaurant): string {
  if (restaurant.latitude === null || restaurant.longitude === null) return '';
  if (shift.clock_in_latitude === null || shift.clock_in_longitude === null) return ' · no location';

  const away = distanceMeters(
    Number(shift.clock_in_latitude),
    Number(shift.clock_in_longitude),
    Number(restaurant.latitude),
    Number(restaurant.longitude)
  );
  return ` · ${formatDistance(away)} away`;
}

function duration(from: string, to: number): string {
  const minutes = Math.max(Math.floor((to - new Date(from).getTime()) / 60_000), 0);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
