'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OrderAuditModal, type AuditOrder } from '@/components/admin/order-audit-modal';
import { formatMoney, orderNetTotal } from '@/lib/manager/totals';
import type { Order, OrderItem, OrderStatus, RestaurantTable } from '@/types/database';

const STATUS_TONE: Record<OrderStatus, string> = {
  placed: 'text-text-muted',
  accepted: 'text-amber',
  preparing: 'text-amber',
  ready: 'text-success',
  served: 'text-text-muted',
  cancelled: 'text-danger',
  voided: 'text-danger',
};

type OrderRow = Order & { items: OrderItem[] };

export function OrderFinancials({
  restaurantId,
  tables,
  refreshToken,
}: {
  restaurantId: string;
  tables: RestaurantTable[];
  refreshToken: number;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const tableNumberFor = useCallback(
    (tableId: string) => tables.find((t) => t.id === tableId)?.table_number ?? '—',
    [tables]
  );

  // Today's tickets only. The manager dashboard is an in-service tool, and an
  // unbounded order history would grow without limit on a long-lived tab.
  const load = useCallback(async () => {
    const supabase = createClient();
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) {
      setLoadError('Could not load orders.');
      setLoading(false);
      return;
    }

    // The hand-written Database types don't model the order_items embed, so
    // map the rows manually instead of casting the query result.
    const rows = (data ?? []) as unknown as (Order & { order_items?: OrderItem[] | null })[];
    setOrders(rows.map(({ order_items, ...rest }) => ({ ...rest, items: order_items ?? [] })));
    setLoadError(null);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const openOrder = orders.find((o) => o.id === openOrderId);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-lg font-bold">Financial Audit</h2>
          <p className="text-xs text-text-muted">Today&apos;s tickets. Open one to void items or apply a discount.</p>
        </div>
        <button type="button" onClick={() => void load()} className="text-xs text-text-muted underline underline-offset-2 hover:text-text">
          Refresh
        </button>
      </div>

      {loadError && (
        <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {loadError}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">No orders yet today.</p>
      ) : (
        <ul className="mt-3 max-h-[420px] divide-y divide-line overflow-y-auto">
          {orders.map((order) => {
            const voidedItems = order.items.filter((i) => i.status === 'voided').length;
            const discounted = Number(order.discount_amount) > 0 || order.items.some((i) => Number(i.discount_amount) > 0);
            const closed = order.status === 'voided' || order.status === 'cancelled';

            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => setOpenOrderId(order.id)}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-ink-800/50"
                >
                  <span className="w-14 shrink-0 font-mono text-sm">#{order.order_number}</span>
                  <span className="w-16 shrink-0 truncate text-xs text-text-muted">T{tableNumberFor(order.table_id)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`text-xs uppercase tracking-wide ${STATUS_TONE[order.status]}`}>{order.status}</span>
                    {(voidedItems > 0 || discounted) && (
                      <span className="ml-2 text-[11px] text-text-muted">
                        {voidedItems > 0 && `${voidedItems} voided`}
                        {voidedItems > 0 && discounted && ' · '}
                        {discounted && 'discounted'}
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 font-mono text-sm ${closed ? 'text-text-muted line-through' : ''}`}>
                    {formatMoney(orderNetTotal(order, order.items))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openOrder && (
        <OrderAuditModal
          order={{ ...openOrder, table_number: tableNumberFor(openOrder.table_id) } as AuditOrder}
          onClose={() => setOpenOrderId(null)}
          onChanged={load}
        />
      )}
    </section>
  );
}
