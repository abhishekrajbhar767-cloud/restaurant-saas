import Link from 'next/link';

// Blocks the operational surfaces (waiter, kitchen) until the staff member
// has an open shift row. Clocking in — including the GPS/geofence check —
// happens on /staff; this is only the gate and the way in.
export function ShiftRequired({ area }: { area: string }) {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="card p-6">
        <span className="text-xs uppercase tracking-wide text-text-muted">Off shift</span>
        <h1 className="mt-2 font-display text-xl font-bold">Clock in to open {area}</h1>
        <p className="mt-2 text-sm text-text-muted">
          You need an active shift before you can take orders, view tables, or manage tickets here.
        </p>

        <Link
          href="/staff"
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-success py-4 font-display text-lg font-bold text-ink-950 transition-opacity hover:opacity-90"
        >
          Start Shift
        </Link>
      </div>
    </div>
  );
}
