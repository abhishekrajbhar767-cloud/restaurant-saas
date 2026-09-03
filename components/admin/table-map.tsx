'use client';

import type { RestaurantTable, ServiceRequestType, TableStatus } from '@/types/database';

// What the floor is actually doing right now, as opposed to the status a
// manager last set by hand. Live signals win: a table someone forgot to mark
// as dining still turns yellow the moment an order lands on it.
export type TableSignals = {
  activeOrders: number;
  readyOrders: number;
  requestTypes: ServiceRequestType[];
};

export type TableTone = 'empty' | 'dining' | 'attention';

export const EMPTY_SIGNALS: TableSignals = { activeOrders: 0, readyOrders: 0, requestTypes: [] };

export function toneFor(table: RestaurantTable, signals: TableSignals): TableTone {
  if (table.status === 'billed' || signals.requestTypes.length > 0 || signals.readyOrders > 0) return 'attention';
  if (table.status === 'dining' || signals.activeOrders > 0) return 'dining';
  return 'empty';
}

const STATUS_OPTIONS: { value: TableStatus; label: string }[] = [
  { value: 'empty', label: 'Empty' },
  { value: 'dining', label: 'Dining' },
  { value: 'billed', label: 'Billed' },
];

const REQUEST_LABEL: Record<ServiceRequestType, string> = { waiter: 'Waiter', water: 'Water', bill: 'Bill' };

const TONE_CARD: Record<TableTone, string> = {
  empty: 'border-success/30 bg-success/5',
  dining: 'border-amber/40 bg-amber/10',
  attention: 'border-danger/50 bg-danger/10',
};

const TONE_ACCENT: Record<TableTone, string> = {
  empty: 'bg-success',
  dining: 'bg-amber',
  attention: 'bg-danger',
};

const TONE_TEXT: Record<TableTone, string> = {
  empty: 'text-success',
  dining: 'text-amber',
  attention: 'text-danger',
};

const TONE_LABEL: Record<TableTone, string> = {
  empty: 'Empty',
  dining: 'Dining',
  attention: 'Action needed',
};

const SELECTED_STATUS: Record<TableStatus, string> = {
  empty: 'bg-success/20 text-success',
  dining: 'bg-amber/20 text-amber',
  billed: 'bg-danger/20 text-danger',
};

export function TableMap({
  tables,
  signalsByTable,
  hiddenCount,
  pendingIds,
  onSetStatus,
}: {
  tables: RestaurantTable[];
  signalsByTable: ReadonlyMap<string, TableSignals>;
  hiddenCount: number;
  pendingIds: ReadonlySet<string>;
  onSetStatus: (tableId: string, status: TableStatus) => void;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-display text-lg font-bold">Live Table Map</h2>
          <p className="text-xs text-text-muted">Every table on the floor, updating as orders and requests come in.</p>
        </div>
        <ul className="flex items-center gap-3 text-[11px] text-text-muted">
          {(['empty', 'dining', 'attention'] as TableTone[]).map((tone) => (
            <li key={tone} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${TONE_ACCENT[tone]}`} aria-hidden />
              {TONE_LABEL[tone]}
            </li>
          ))}
        </ul>
      </div>

      {tables.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          No active tables yet — add them under <span className="text-text">Tables</span> to see them here.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              signals={signalsByTable.get(table.id) ?? EMPTY_SIGNALS}
              isPending={pendingIds.has(table.id)}
              onSetStatus={onSetStatus}
            />
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <p className="mt-3 text-xs text-text-muted">
          {hiddenCount} inactive {hiddenCount === 1 ? 'table is' : 'tables are'} hidden from the map.
        </p>
      )}
    </section>
  );
}

function TableCard({
  table,
  signals,
  isPending,
  onSetStatus,
}: {
  table: RestaurantTable;
  signals: TableSignals;
  isPending: boolean;
  onSetStatus: (tableId: string, status: TableStatus) => void;
}) {
  const tone = toneFor(table, signals);

  return (
    <li
      className={`relative flex flex-col overflow-hidden rounded-lg border p-3 transition-colors ${TONE_CARD[tone]} ${
        isPending ? 'opacity-60' : ''
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${TONE_ACCENT[tone]}`} aria-hidden />

      <div className="flex items-start justify-between gap-2 pt-1">
        <span className="font-display font-mono text-xl font-bold leading-none">{table.table_number}</span>
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_ACCENT[tone]} ${tone === 'attention' ? 'animate-pulse' : ''}`}
          aria-hidden
        />
      </div>

      <span className={`mt-1.5 text-[11px] font-medium uppercase tracking-wide ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</span>

      <div className="mt-2 min-h-[34px] space-y-1.5">
        {signals.activeOrders > 0 && (
          <p className="text-xs text-text-muted">
            {signals.activeOrders} live {signals.activeOrders === 1 ? 'order' : 'orders'}
            {signals.readyOrders > 0 && <span className="text-danger"> · {signals.readyOrders} ready</span>}
          </p>
        )}
        {signals.requestTypes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {signals.requestTypes.map((type) => (
              <span key={type} className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-medium text-danger">
                {REQUEST_LABEL[type]}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 rounded border border-line bg-ink-950/40 p-1">
        {STATUS_OPTIONS.map((option) => {
          const selected = table.status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              aria-label={`Mark table ${table.table_number} as ${option.label}`}
              disabled={isPending}
              onClick={() => onSetStatus(table.id, option.value)}
              className={`rounded-sm py-2 text-[11px] font-display uppercase tracking-wide transition-colors disabled:pointer-events-none ${
                selected ? SELECTED_STATUS[option.value] : 'text-text-muted hover:bg-ink-800 hover:text-text'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}
