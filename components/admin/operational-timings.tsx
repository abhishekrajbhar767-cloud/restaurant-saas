import { ROLE_LABEL } from '@/lib/auth/roles';
import { formatMinutes } from '@/lib/shared/duration';
import type { MemberRole, StaffRating, StaffRequestTiming, TableTurnaround } from '@/types/database';

type StaffRow = {
  staffId: string;
  name: string;
  role: MemberRole | null;
  requestsCompleted: number;
  averageMinutes: number | null;
  longestMinutes: number;
  ratingCount: number;
  averageRating: number | null;
};

export function OperationalTimings({
  turnaround,
  timings,
  ratings,
}: {
  turnaround: TableTurnaround;
  timings: StaffRequestTiming[];
  ratings: StaffRating[];
}) {
  const staff = mergeStaff(timings, ratings);
  const requestsDone = timings.reduce((sum, row) => sum + row.requests_completed, 0);
  const ratingsGiven = ratings.reduce((sum, row) => sum + row.rating_count, 0);
  // Ratings nobody could be credited for still belong in the floor-wide
  // average, so they are counted here and called out below the table.
  const unattributed = ratings.find((row) => row.staff_id === null)?.rating_count ?? 0;

  return (
    <section className="card p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Speed of Service</h2>
        <p className="text-xs text-text-muted">
          How long tables stay occupied, how fast the floor closes out requests, and what guests thought.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
          value={weightedMinutes(timings)}
          hint={requestsDone === 0 ? 'No requests completed' : `${requestsDone} completed`}
        />
        <Metric
          label="Avg waiter rating"
          value={overallRating(ratings)}
          hint={ratingsGiven === 0 ? 'No ratings yet' : `${ratingsGiven} ${ratingsGiven === 1 ? 'rating' : 'ratings'}`}
          tone="text-amber"
        />
      </div>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-text-muted">Staff performance</h3>

      {staff.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">
          No requests were completed and no ratings came in on this day. Request time is measured from the moment a
          request is accepted until it is marked done.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {staff.map((row) => (
            <li
              key={row.staffId}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded border border-line bg-ink-800/40 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium">{row.name}</span>
                {row.role && (
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-text-muted">{ROLE_LABEL[row.role]}</span>
                )}
              </div>
              <div className="flex items-baseline gap-4 font-mono text-xs">
                <span className="text-text-muted">
                  {row.requestsCompleted} {row.requestsCompleted === 1 ? 'request' : 'requests'}
                </span>
                <span className="text-text-muted">worst {formatMinutes(row.longestMinutes)}</span>
                <span className="text-sm">
                  {row.averageMinutes === null ? '—' : formatMinutes(row.averageMinutes)}
                </span>
                <span className="w-20 text-right text-sm text-amber">
                  {row.averageRating === null ? '—' : `${row.averageRating.toFixed(1)} ★ (${row.ratingCount})`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {unattributed > 0 && (
        <p className="mt-3 text-[11px] text-text-muted">
          {unattributed} {unattributed === 1 ? 'rating' : 'ratings'} could not be credited to a waiter — nobody picked up
          a request at that table during the visit.
        </p>
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

// Request timings and ratings arrive as two independent lists, and somebody
// can appear in one without the other — a waiter may be rated on a visit
// where they never had to answer a request.
function mergeStaff(timings: StaffRequestTiming[], ratings: StaffRating[]): StaffRow[] {
  const rows = new Map<string, StaffRow>();

  for (const timing of timings) {
    rows.set(timing.staff_id, {
      staffId: timing.staff_id,
      name: timing.display_name ?? timing.email,
      role: timing.role,
      requestsCompleted: timing.requests_completed,
      averageMinutes: timing.average_minutes,
      longestMinutes: timing.longest_minutes,
      ratingCount: 0,
      averageRating: null,
    });
  }

  for (const rating of ratings) {
    if (rating.staff_id === null) continue;

    const existing = rows.get(rating.staff_id);
    if (existing) {
      existing.ratingCount = rating.rating_count;
      existing.averageRating = rating.average_rating;
      continue;
    }
    rows.set(rating.staff_id, {
      staffId: rating.staff_id,
      name: rating.display_name ?? rating.email ?? 'Unknown',
      role: rating.role,
      requestsCompleted: 0,
      averageMinutes: null,
      longestMinutes: 0,
      ratingCount: rating.rating_count,
      averageRating: rating.average_rating,
    });
  }

  return [...rows.values()].sort(
    (a, b) => b.requestsCompleted - a.requestsCompleted || a.name.localeCompare(b.name)
  );
}

// Weighted by volume, so one waiter who handled a single slow request doesn't
// drag the floor-wide average as far as their per-person row suggests.
function weightedMinutes(timings: StaffRequestTiming[]): string {
  const total = timings.reduce((sum, row) => sum + row.requests_completed, 0);
  if (total === 0) return '—';
  const weighted = timings.reduce((sum, row) => sum + (row.average_minutes ?? 0) * row.requests_completed, 0);
  return formatMinutes(weighted / total);
}

function overallRating(ratings: StaffRating[]): string {
  const total = ratings.reduce((sum, row) => sum + row.rating_count, 0);
  if (total === 0) return '—';
  const weighted = ratings.reduce((sum, row) => sum + row.average_rating * row.rating_count, 0);
  return `${(weighted / total).toFixed(1)} ★`;
}
