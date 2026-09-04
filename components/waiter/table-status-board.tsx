'use client';

import { formatMinutes, minutesSince } from '@/lib/shared/duration';
import type { RestaurantTable, TableStatus } from '@/types/database';

// Staff-facing names for the floor. The database calls an unoccupied table
// 'empty', but a waiter clearing one is thinking "free", and the customer's
// QR menu is what 'empty' actually gates.
const STATUS_LABEL: Record<TableStatus, string> = {
  empty: 'Free',
  dining: 'Occupied',
  billed: 'Billed',
};

const STATUS_CARD: Record<TableStatus, string> = {
  empty: 'border-success/30 bg-success/5',
  dining: 'border-amber/40 bg-amber/10',
  billed: 'border-danger/50 bg-danger/10',
};

const STATUS_ACCENT: Record<TableStatus, string> = {
  empty: 'bg-success',
  dining: 'bg-amber',
  billed: 'bg-danger',
};

const STATUS_TEXT: Record<TableStatus, string> = {
  empty: 'text-success',
  dining: 'text-amber',
  billed: 'text-danger',
};

export function TableStatusBoard({
  tables,
  pendingIds,
  nowMs,
  onSetStatus,
}: {
  tables: RestaurantTable[];
  pendingIds: ReadonlySet<string>;
  nowMs: number;
  onSetStatus: (tableId: string, status: TableStatus) => void;
}) {
  const freeCount = tables.filter((t) => t.status === 'empty').length;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-text-muted">Tables</h2>
        <p className="text-xs text-text-muted">
          <span className="text-success">{freeCount} free</span> · {tables.length - freeCount} occupied
        </p>
      </div>

      {tables.length === 0 ? (
        <p className="text-sm text-text-muted">No active tables yet.</p>
      ) : (
        <ul className="space-y-2">
          {tables.map((table) => (
            <TableRow
              key={table.id}
              table={table}
              isPending={pendingIds.has(table.id)}
              nowMs={nowMs}
              onSetStatus={onSetStatus}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TableRow({
  table,
  isPending,
  nowMs,
  onSetStatus,
}: {
  table: RestaurantTable;
  isPending: boolean;
  nowMs: number;
  onSetStatus: (tableId: string, status: TableStatus) => void;
}) {
  const isFree = table.status === 'empty';
  // nowMs is 0 until the clock starts on mount; rendering "0m" in that gap
  // would be a visible flash of a wrong number.
  const occupiedMinutes = nowMs > 0 && table.occupied_since && !isFree ? minutesSince(table.occupied_since, nowMs) : null;

  return (
    <li
      className={`flex items-center gap-3 overflow-hidden rounded-lg border p-3 transition-colors ${
        STATUS_CARD[table.status]
      } ${isPending ? 'opacity-60' : ''}`}
    >
      <span className={`h-10 w-1.5 shrink-0 rounded-full ${STATUS_ACCENT[table.status]}`} aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="font-display font-mono text-lg font-bold leading-tight">Table {table.table_number}</p>
        <p className={`text-xs font-medium uppercase tracking-wide ${STATUS_TEXT[table.status]}`}>
          {STATUS_LABEL[table.status]}
          {occupiedMinutes !== null && (
            <span className="ml-1.5 font-normal normal-case tracking-normal text-text-muted">
              · seated <span className="font-mono tabular-nums">{formatMinutes(occupiedMinutes)}</span>
            </span>
          )}
        </p>
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={() => onSetStatus(table.id, isFree ? 'dining' : 'empty')}
        aria-label={isFree ? `Seat table ${table.table_number}` : `Mark table ${table.table_number} free`}
        className={`shrink-0 rounded px-3.5 py-2.5 font-display text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${
          isFree
            ? 'bg-amber text-ink-950 hover:bg-amber-bright'
            : 'border border-success/50 text-success hover:bg-success/10'
        }`}
      >
        {isFree ? 'Seat Table' : 'Mark Free'}
      </button>
    </li>
  );
}
