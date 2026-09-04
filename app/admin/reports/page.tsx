import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { getRestaurantById } from '@/lib/restaurant/queries';
import { getEodSummary, getStaffShiftHistory, getTopSellingItems } from '@/lib/restaurant/reports';
import { EodSummaryCards } from '@/components/admin/eod-summary';
import { TopSellingItems } from '@/components/admin/top-selling-items';
import { ShiftHistory } from '@/components/admin/shift-history';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({ searchParams }: { searchParams: { date?: string } }) {
  const ctx = await requireRole(['owner', 'manager']);
  const membership = ctx.tenantMembership!;
  const restaurant = (await getRestaurantById(membership.restaurant.id)) ?? membership.restaurant;
  const timeZone = restaurant.timezone || 'Asia/Kolkata';

  // The report day is the restaurant's calendar day, so "today" has to be
  // resolved in its timezone rather than the server's.
  const today = todayIn(timeZone);
  const requested = searchParams.date;
  const day = requested && DAY_PATTERN.test(requested) && requested <= today ? requested : today;

  const [summary, topItems, shifts] = await Promise.all([
    getEodSummary(restaurant.id, day),
    getTopSellingItems(restaurant.id, day, 10),
    getStaffShiftHistory(restaurant.id, day),
  ]);

  const previous = shiftDay(day, -1);
  const next = shiftDay(day, 1);
  const isToday = day === today;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Reports</h1>
          <p className="text-sm text-text-muted">
            {isToday ? 'Today so far' : formatDay(day)} · {restaurant.name}
          </p>
        </div>

        {/* A plain GET form keeps the whole screen server-rendered. */}
        <form method="get" className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/reports?date=${previous}`} className="btn-secondary px-3 py-2 text-sm" aria-label="Previous day">
            ←
          </Link>
          <label htmlFor="date" className="sr-only">
            Report date
          </label>
          <input id="date" name="date" type="date" defaultValue={day} max={today} className="field-input w-44 py-2" />
          <button type="submit" className="btn-secondary text-sm">
            Go
          </button>
          {isToday ? (
            <span className="btn-secondary pointer-events-none px-3 py-2 text-sm opacity-40" aria-hidden>
              →
            </span>
          ) : (
            <Link href={`/admin/reports?date=${next}`} className="btn-secondary px-3 py-2 text-sm" aria-label="Next day">
              →
            </Link>
          )}
        </form>
      </div>

      <EodSummaryCards summary={summary} />

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <TopSellingItems items={topItems} />
        <ShiftHistory rows={shifts} timeZone={timeZone} />
      </div>
    </div>
  );
}

function todayIn(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is also the value a date input wants.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// `day` is already the restaurant's local calendar date, so it is formatted
// as a UTC instant to print those exact digits back — converting it into a
// timezone here would shift the label by a day at the extremes.
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
