import { ROLE_LABEL } from '@/lib/auth/roles';
import type { StaffShiftHistoryRow } from '@/types/database';

type StaffGroup = {
  staffId: string;
  name: string;
  role: StaffShiftHistoryRow['role'];
  shifts: StaffShiftHistoryRow[];
  totalMinutes: number;
  hasOpenShift: boolean;
};

export function ShiftHistory({ rows, timeZone }: { rows: StaffShiftHistoryRow[]; timeZone: string }) {
  const groups = groupByStaff(rows);
  const totalMinutes = groups.reduce((sum, g) => sum + g.totalMinutes, 0);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-lg font-bold">Staff Shift History</h2>
          <p className="text-xs text-text-muted">
            Every clock-in and clock-out for the day, so breaks and split shifts stay visible.
          </p>
        </div>
        <span className="text-xs text-text-muted">
          {groups.length} {groups.length === 1 ? 'person' : 'people'} · {formatHours(totalMinutes)} total
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Nobody clocked in on this day.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group.staffId} className="rounded border border-line bg-ink-800/40 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{group.name}</span>
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-text-muted">
                    {ROLE_LABEL[group.role]}
                  </span>
                  {group.hasOpenShift && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                      on shift
                    </span>
                  )}
                </div>
                <span className="font-mono text-sm text-amber">{formatHours(group.totalMinutes)}</span>
              </div>

              <ul className="mt-2 space-y-1">
                {group.shifts.map((shift) => (
                  <li key={shift.shift_id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-mono text-text-muted">
                      {formatTime(shift.clock_in_time, timeZone)} →{' '}
                      {shift.clock_out_time ? (
                        formatTime(shift.clock_out_time, timeZone)
                      ) : (
                        <span className="text-success">still open</span>
                      )}
                    </span>
                    <span className="font-mono">{formatHours(shift.minutes_worked)}</span>
                  </li>
                ))}
              </ul>

              {group.shifts.length > 1 && (
                <p className="mt-2 text-[11px] text-text-muted">
                  {group.shifts.length} separate shifts — gaps between them are unpaid breaks.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Rows arrive sorted by staff then clock-in, so a Map preserves both the
// person order and the chronological order of their shifts.
function groupByStaff(rows: StaffShiftHistoryRow[]): StaffGroup[] {
  const groups = new Map<string, StaffGroup>();

  for (const row of rows) {
    const existing = groups.get(row.staff_id);
    if (existing) {
      existing.shifts.push(row);
      existing.totalMinutes += row.minutes_worked;
      existing.hasOpenShift = existing.hasOpenShift || row.is_open;
      continue;
    }
    groups.set(row.staff_id, {
      staffId: row.staff_id,
      name: row.display_name ?? row.email,
      role: row.role,
      shifts: [row],
      totalMinutes: row.minutes_worked,
      hasOpenShift: row.is_open,
    });
  }

  return [...groups.values()];
}

function formatHours(minutes: number): string {
  const safe = Math.max(minutes, 0);
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function formatTime(value: string, timeZone: string): string {
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone });
}
