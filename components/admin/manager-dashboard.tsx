'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setMenuItemAvailability, setTableStatus } from '@/lib/manager/actions';
import { MenuQuickActions } from '@/components/admin/menu-quick-actions';
import { OrderFinancials } from '@/components/admin/order-financials';
import { EMPTY_SIGNALS, TableMap, toneFor, type TableSignals, type TableTone } from '@/components/admin/table-map';
import type {
  MenuCategory,
  MenuItem,
  Order,
  RestaurantTable,
  ServiceRequest,
  TableStatus,
} from '@/types/database';

const LIVE_ORDER_STATUSES: Order['status'][] = ['placed', 'accepted', 'preparing', 'ready'];
const OPEN_REQUEST_STATUSES: ServiceRequest['status'][] = ['pending', 'claimed'];

export function ManagerDashboard({
  restaurantId,
  initialTables,
  initialCategories,
  initialItems,
  initialOrders,
  initialRequests,
}: {
  restaurantId: string;
  initialTables: RestaurantTable[];
  initialCategories: MenuCategory[];
  initialItems: MenuItem[];
  initialOrders: Order[];
  initialRequests: ServiceRequest[];
}) {
  const [tables, setTables] = useState(initialTables);
  const [items, setItems] = useState(initialItems);
  const [orders, setOrders] = useState(initialOrders);
  const [requests, setRequests] = useState(initialRequests);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever an order row changes so the financial panel refetches —
  // it needs order_items too, which the realtime payload doesn't carry.
  const [orderVersion, setOrderVersion] = useState(0);
  const [pendingTableIds, setPendingTableIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(new Set());

  // Guards a second tap landing while the first write is still in flight —
  // without it the rollback path can restore a value the user already changed.
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`manager-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const removed = payload.old as Partial<RestaurantTable>;
            setTables((prev) => prev.filter((t) => t.id !== removed.id));
            return;
          }
          setTables((prev) => upsertById(prev, payload.new as RestaurantTable));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const removed = payload.old as Partial<MenuItem>;
            setItems((prev) => prev.filter((i) => i.id !== removed.id));
            return;
          }
          setItems((prev) => upsertById(prev, payload.new as MenuItem));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          setOrderVersion((v) => v + 1);
          if (payload.eventType === 'DELETE') {
            const removed = payload.old as Partial<Order>;
            setOrders((prev) => prev.filter((o) => o.id !== removed.id));
            return;
          }
          const order = payload.new as Order;
          setOrders((prev) =>
            LIVE_ORDER_STATUSES.includes(order.status) ? upsertById(prev, order) : prev.filter((o) => o.id !== order.id)
          );
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const removed = payload.old as Partial<ServiceRequest>;
            setRequests((prev) => prev.filter((r) => r.id !== removed.id));
            return;
          }
          const request = payload.new as ServiceRequest;
          setRequests((prev) =>
            OPEN_REQUEST_STATUSES.includes(request.status)
              ? upsertById(prev, request)
              : prev.filter((r) => r.id !== request.id)
          );
        }
      )
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  const activeTables = useMemo(
    () =>
      tables
        .filter((table) => table.is_active)
        .sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true })),
    [tables]
  );

  const signalsByTable = useMemo(() => {
    const map = new Map<string, TableSignals>();
    const forTable = (tableId: string): TableSignals => {
      const existing = map.get(tableId);
      if (existing) return existing;
      const created: TableSignals = { activeOrders: 0, readyOrders: 0, requestTypes: [] };
      map.set(tableId, created);
      return created;
    };

    for (const order of orders) {
      const signals = forTable(order.table_id);
      signals.activeOrders += 1;
      if (order.status === 'ready') signals.readyOrders += 1;
    }
    for (const request of requests) {
      const signals = forTable(request.table_id);
      if (!signals.requestTypes.includes(request.type)) signals.requestTypes.push(request.type);
    }
    return map;
  }, [orders, requests]);

  const toneCounts = useMemo(() => {
    const counts: Record<TableTone, number> = { empty: 0, dining: 0, attention: 0 };
    for (const table of activeTables) {
      counts[toneFor(table, signalsByTable.get(table.id) ?? EMPTY_SIGNALS)] += 1;
    }
    return counts;
  }, [activeTables, signalsByTable]);

  const unavailableCount = items.filter((item) => !item.is_available).length;

  async function handleSetTableStatus(tableId: string, status: TableStatus) {
    const current = tables.find((t) => t.id === tableId);
    if (!current || current.status === status || inFlightRef.current.has(tableId)) return;

    inFlightRef.current.add(tableId);
    setPendingTableIds((prev) => withId(prev, tableId));
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status } : t)));

    const { error: writeError } = await setTableStatus(tableId, status);

    inFlightRef.current.delete(tableId);
    setPendingTableIds((prev) => withoutId(prev, tableId));
    if (writeError) {
      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status: current.status } : t)));
      setError(`Couldn't update table ${current.table_number}. Try again.`);
    }
  }

  async function handleToggleItem(itemId: string, isAvailable: boolean) {
    const current = items.find((i) => i.id === itemId);
    if (!current || inFlightRef.current.has(itemId)) return;

    inFlightRef.current.add(itemId);
    setPendingItemIds((prev) => withId(prev, itemId));
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_available: isAvailable } : i)));

    const { error: writeError } = await setMenuItemAvailability(itemId, isAvailable);

    inFlightRef.current.delete(itemId);
    setPendingItemIds((prev) => withoutId(prev, itemId));
    if (writeError) {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_available: current.is_available } : i)));
      setError(`Couldn't update ${current.name}. Try again.`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-2 text-xs ${isLive ? 'text-success' : 'text-text-muted'}`}>
          <span className={`h-2 w-2 rounded-full ${isLive ? 'animate-pulse bg-success' : 'bg-text-muted'}`} aria-hidden />
          {isLive ? 'Live' : 'Connecting…'}
        </span>
        {error && (
          <p role="alert" className="rounded border border-danger/30 bg-danger/10 px-3 py-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Empty" value={toneCounts.empty} tone="text-success" />
        <Summary label="Dining" value={toneCounts.dining} tone="text-amber" />
        <Summary label="Action needed" value={toneCounts.attention} tone="text-danger" />
        <Summary label="86'd items" value={unavailableCount} tone={unavailableCount > 0 ? 'text-danger' : 'text-text'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <TableMap
          tables={activeTables}
          signalsByTable={signalsByTable}
          hiddenCount={tables.length - activeTables.length}
          pendingIds={pendingTableIds}
          onSetStatus={handleSetTableStatus}
        />
        <MenuQuickActions
          categories={initialCategories}
          items={items}
          pendingIds={pendingItemIds}
          onToggle={handleToggleItem}
        />
      </div>

      <OrderFinancials restaurantId={restaurantId} tables={tables} refreshToken={orderVersion} />
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-3.5">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`font-display text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function upsertById<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [...rows, row];
}

function withId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.add(id);
  return next;
}

function withoutId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}
