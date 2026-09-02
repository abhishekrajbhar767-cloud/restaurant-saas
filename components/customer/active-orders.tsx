'use client';

// "My Active Orders" — live status for every order this table has placed and
// that isn't finished yet (pending / preparing / ready). Rendered at the top
// of the customer menu so a customer who navigated back from the order page
// still sees progress in real time.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Order, OrderItem, OrderStatus } from '@/types/database';

type ActiveOrder = Order & { items: OrderItem[] };

const STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  placed: 'Pending',
  accepted: 'Preparing',
  preparing: 'Preparing',
  ready: 'Ready',
};

const STATUS_STYLE: Partial<Record<OrderStatus, string>> = {
  placed: 'bg-ink-950/10 text-text-onPaper/70',
  accepted: 'bg-amber/20 text-ink-950',
  preparing: 'bg-amber/20 text-ink-950',
  ready: 'bg-success/20 text-ink-950',
};

const ACTIVE_STATUSES: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready'];

export function ActiveOrders({
  tableId,
  restaurantSlug,
  tableQrToken,
  currency,
}: {
  tableId: string;
  restaurantSlug: string;
  tableQrToken: string;
  currency: string;
}) {
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('table_id', tableId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        // The hand-written Database types don't model the order_items embed,
        // so map the rows manually instead of casting the query result.
        const rows = (data ?? []) as unknown as (Order & { order_items?: OrderItem[] | null })[];
        setOrders(rows.map(({ order_items, ...rest }) => ({ ...rest, items: order_items ?? [] })));
        setLoaded(true);
      });

    const channel = supabase
      .channel(`active-orders-${tableId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `table_id=eq.${tableId}` },
        async (payload) => {
          const order = payload.new as Order;
          const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
          setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [...prev, { ...order, items: items ?? [] }]));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `table_id=eq.${tableId}` },
        (payload) => {
          const updated = payload.new as Order;
          setOrders((prev) =>
            ACTIVE_STATUSES.includes(updated.status)
              ? prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
              : prev.filter((o) => o.id !== updated.id)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId]);

  if (!loaded || orders.length === 0) return null;

  return (
    <section className="px-5 pb-1" aria-label="My active orders">
      <h2 className="font-display font-bold text-sm uppercase tracking-wide text-text-onPaper/50 mt-4 mb-2">My Active Orders</h2>
      <div className="space-y-2">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/menu/${restaurantSlug}/order/${order.id}?table=${tableQrToken}`}
            className="block rounded-lg border border-ink-950/10 bg-white/60 px-4 py-3 active:bg-ink-950/5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-xs text-text-onPaper/50">#{order.order_number}</span>
                <p className="font-medium text-sm truncate">
                  {summarizeItems(order.items)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-display ${STATUS_STYLE[order.status] ?? ''}`}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
                {countdownFor(order) && <p className="font-mono text-xs text-amber-dim mt-1">{countdownFor(order)}</p>}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <p className="text-[11px] text-text-onPaper/40 mt-1">Tap an order to see the full tracker · {currency}</p>
    </section>
  );
}

function summarizeItems(items: OrderItem[]): string {
  if (items.length === 0) return 'Placing your order…';
  const firstItem = items[0];
  if (!firstItem) return 'Placing your order…';
  const first = `${firstItem.quantity}× ${firstItem.item_name}`;
  if (items.length === 1) return first;
  return `${first} +${items.length - 1} more`;
}

function countdownFor(order: Order): string | null {
  if (!order.estimated_minutes || !order.accepted_at) return null;
  if (order.status !== 'accepted' && order.status !== 'preparing') return null;

  const target = new Date(order.accepted_at).getTime() + order.estimated_minutes * 60_000;
  const remainingMs = target - Date.now();
  if (remainingMs <= 0) return 'Any moment now';

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  return `~${minutes}:${seconds.toString().padStart(2, '0')}`;
}
