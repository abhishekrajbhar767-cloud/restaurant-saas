import { ROLE_LABEL } from '@/lib/auth/roles';
import { formatMinutes } from '@/lib/shared/duration';
import type { StaffRequestTiming, TableTurnaround } from '@/types/database';

export function OperationalTimings({
  turnaround,
  timings,
}: {
  turnaround: TableTurnaround;
  timings: StaffRequestTiming[];
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Speed of Service</h2>
        <p className="text-xs text-text-muted">
          How long tables stay occupied, and how fast the floor closes out requests.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Avg table turnaround"
          value={turnaround.average_minutes === null ? '—' : formatMinutes(turnaround.average_minutes)}
          hint={
            turnaround.completed_sessions === 0
              ? 'No tables cleared yet'
              : `${turnaround.completed_sessions} ${turnaround.completed_sessions === 1 ? 'table' : 'tables'} cleared`
          }
          tone="text-amber"
        />
        <Metric
          label="Longest sitting"
          value={turnaround.longest_minutes > 0 ? formatMinutes(turnaround.longest_minutes) : '—'}
          hint="Seated to cleared"
        />
        <Metric
          label="Still occupied"
          value={String(turnaround.open_sessions)}
          hint="Tables not yet cleared"
          tone={turnaround.open_sessions > 0 ? 'text-amber' : undefined}
        />
        <Metric
          label="Avg request time"
          value={averageAcross(timings)}
          hint={
            totalRequests(timings) === 0
              ? 'No requests completed'
              : `${totalRequests(timings)} completed`
          }
        />
      </div>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-text-muted">
        Request completion by staff member
      </h3>

      {timings.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">
          Nobody completed a table request on this day. Times are measured from the moment a request is accepted until
          it is marked done.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {timings.map((row) => (
            <li
              key={row.staff_id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded border border-line bg-ink-800/40 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium">{row.display_name ?? row.email}</span>
                <span className="ml-2 text-[11px] uppercase tracking-wide text-text-muted">{ROLE_LABEL[row.role]}</span>
              </div>
              <div className="flex items-baseline gap-4 font-mono text-xs">
                <span className="text-text-muted">
                  {row.requests_completed} {row.requests_completed === 1 ? 'request' : 'requests'}
                </span>
                <span className="text-text-muted">worst {formatMinutes(row.longest_minutes)}</span>
                <span className="text-sm text-amber">
                  {row.average_minutes === null ? '—' : formatMinutes(row.average_minutes)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = 'text-text',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded border border-line bg-ink-800/40 p-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`font-display text-xl font-bold ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-text-muted">{hint}</div>
    </div>
  );
}

function totalRequests(timings: StaffRequestTiming[]): number {
  return timings.reduce((sum, row) => sum + row.requests_completed, 0);
}

// Weighted by volume, so one waiter who handled a single slow request doesn't
// drag the floor-wide average as far as their per-person row suggests.
function averageAcross(timings: StaffRequestTiming[]): string {
  const total = totalRequests(timings);
  if (total === 0) return '—';
  const weighted = timings.reduce((sum, row) => sum + (row.average_minutes ?? 0) * row.requests_completed, 0);
  return formatMinutes(weighted / total);
}
