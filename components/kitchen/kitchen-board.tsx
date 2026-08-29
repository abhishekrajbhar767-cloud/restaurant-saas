'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAlertSound } from '@/lib/kitchen/use-alert-sound';
import { acceptOrder, markReady, markServed, cancelOrder } from '@/lib/kitchen/actions';
import { OrderTicket } from '@/components/kitchen/order-ticket';
import type { OrderWithItems, Order } from '@/types/database';

export function KitchenBoard({ restaurantId, initialOrders }: { restaurantId: string; initialOrders: OrderWithItems[] }) {
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [shiftActive, setShiftActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useAlertSound();
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  // Realtime is the ONLY way this board learns about new/changed orders —
  // no setTimeout, no polling. New INSERTs need a follow-up fetch for their
  // items (the INSERT payload only carries the orders row); UPDATEs merge
  // in place since order_items never change after creation.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`kds-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const newOrder = payload.new as Order;
          const [{ data: items }, { data: table }] = await Promise.all([
            supabase.from('order_items').select('*').eq('order_id', newOrder.id),
            supabase.from('tables').select('table_number').eq('id', newOrder.table_id).maybeSingle(),
          ]);
          setOrders((prev) => [...prev, { ...newOrder, items: items ?? [], table_number: table?.table_number ?? '—' }]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const updated = payload.new as Order;
          setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const newOrders = orders.filter((o) => o.status === 'placed');
  const preparingOrders = orders.filter((o) => o.status === 'accepted' || o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  // A single shared loop, never one per order — start()/stop() are both
  // idempotent (see use-alert-sound.ts), so this effect can fire on every
  // newOrders.length change without ever stacking intervals.
  useEffect(() => {
    if (shiftActive && newOrders.length > 0) {
      sound.start();
    } else {
      sound.stop();
    }
  }, [shiftActive, newOrders.length, sound]);

  useEffect(() => () => sound.stop(), [sound]);

  function handleStartShift() {
    sound.unlock(); // must happen synchronously inside this click handler
    setShiftActive(true);
  }

  async function handleAccept(orderId: string, minutes: number) {
    const { error } = await acceptOrder(orderId, minutes);
    if (error) setError(error);
  }

  async function handleReady(orderId: string) {
    const { error } = await markReady(orderId);
    if (error) setError(error);
  }

  async function handleServed(orderId: string) {
    const { error } = await markServed(orderId);
    if (error) setError(error);
    else setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  async function handleCancel(orderId: string) {
    const reason = window.prompt('Reason for cancelling this order (optional):') ?? '';
    const { error } = await cancelOrder(orderId, reason);
    if (error) setError(error);
    else setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  if (!shiftActive) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-text-muted text-sm max-w-xs text-center">
          Start your shift to enable live order alerts. Browsers block sound until you interact with the page.
        </p>
        <button onClick={handleStartShift} className="btn-primary text-lg px-8 py-3">
          Start Shift
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-2 text-xs text-success">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" aria-hidden />
          Shift Active
        </span>
        {error && (
          <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-1">
            {error}
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Column title="New" count={newOrders.length} accent>
          {newOrders.map((o) => (
            <OrderTicket key={o.id} order={o} onAccept={(m) => handleAccept(o.id, m)} onCancel={() => handleCancel(o.id)} />
          ))}
        </Column>
        <Column title="Preparing" count={preparingOrders.length}>
          {preparingOrders.map((o) => (
            <OrderTicket key={o.id} order={o} onReady={() => handleReady(o.id)} onCancel={() => handleCancel(o.id)} />
          ))}
        </Column>
        <Column title="Ready" count={readyOrders.length}>
          {readyOrders.map((o) => (
            <OrderTicket key={o.id} order={o} onServed={() => handleServed(o.id)} />
          ))}
        </Column>
      </div>
    </div>
  );
}

function Column({ title, count, accent, children }: { title: string; count: number; accent?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className={`font-display font-bold uppercase tracking-wide text-sm ${accent ? 'text-amber' : 'text-text-muted'}`}>{title}</h2>
        <span className="text-xs font-mono text-text-muted">{count}</span>
      </div>
      <div className="space-y-3">
        {children}
        {count === 0 && <p className="text-xs text-text-muted">Nothing here.</p>}
      </div>
    </div>
  );
}
