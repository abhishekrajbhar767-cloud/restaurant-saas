'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ServiceStatusBanner } from '@/components/customer/service-status-banner';
import { QuickActions } from '@/components/customer/quick-actions';
import type { Order, OrderItem, OrderStatus } from '@/types/database';

const STEPS: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready', 'served'];
const STEP_LABEL: Record<OrderStatus, string> = {
  placed: 'Placed',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
  voided: 'Voided',
};

export function OrderTracker({
  initialOrder,
  orderItems,
  restaurantName,
  currency,
  tableNumber,
  tableId,
  restaurantSlug,
  tableQrToken,
}: {
  initialOrder: Order;
  orderItems: OrderItem[];
  restaurantName: string;
  currency: string;
  tableNumber: string;
  tableId: string;
  restaurantSlug: string;
  tableQrToken?: string;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [now, setNow] = useState(() => Date.now());

  // Realtime — the ONLY source of status updates. No polling, no timers
  // simulating kitchen progress.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order-${order.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (payload) => {
        setOrder(payload.new as Order);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once per order id
  }, [order.id]);

  // A 1s tick purely to re-render the countdown display — this does not
  // simulate or infer status; it only reformats a real timestamp already
  // pushed by realtime (accepted_at + estimated_minutes).
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const countdown = getCountdown(order, now);
  const currentStepIndex = STEPS.indexOf(order.status);
  // Voided lines and manager discounts have to be reflected here — this is the
  // bill the customer is looking at while the manager edits it.
  const activeItems = orderItems.filter((i) => i.status !== 'voided');
  const itemsTotal = activeItems.reduce((sum, i) => sum + Math.max(i.unit_price * i.quantity - Number(i.discount_amount), 0), 0);
  const total = Math.max(itemsTotal - Number(order.discount_amount), 0);
  const closed = order.status === 'cancelled' || order.status === 'voided';

  return (
    <div className="min-h-screen bg-paper text-text-onPaper">
      <ServiceStatusBanner tableId={tableId} />
      <div className="px-5 py-8 max-w-md mx-auto">
      <Link
        href={tableQrToken ? `/menu/${restaurantSlug}?table=${tableQrToken}` : `/menu/${restaurantSlug}`}
        className="text-xs text-text-onPaper/50 underline underline-offset-2"
      >
        ← Back to menu
      </Link>

      <h1 className="font-display text-xl font-bold mt-3">{restaurantName}</h1>
      <p className="text-sm text-text-onPaper/50 mb-6">
        Table {tableNumber} · Order #{order.order_number}
      </p>

      {closed ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-5">
          <p className="font-display font-bold text-danger mb-1">
            {order.status === 'voided' ? 'Order voided' : 'Order cancelled'}
          </p>
          {(order.void_reason || order.cancellation_reason) && (
            <p className="text-sm text-text-onPaper/70">{order.void_reason ?? order.cancellation_reason}</p>
          )}
        </div>
      ) : (
        <ol className="space-y-0 mb-6" aria-label="Order status">
          {STEPS.map((step, i) => {
            const reached = i <= currentStepIndex;
            return (
              <li key={step} className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <span className={`h-3 w-3 rounded-full shrink-0 ${reached ? 'bg-amber' : 'bg-ink-950/15'}`} aria-hidden />
                  {i < STEPS.length - 1 && <span className={`w-px h-8 ${i < currentStepIndex ? 'bg-amber' : 'bg-ink-950/15'}`} aria-hidden />}
                </div>
                <span className={`pb-8 font-display ${reached ? 'text-text-onPaper font-medium' : 'text-text-onPaper/40'}`}>
                  {STEP_LABEL[step]}
                  {step === order.status && countdown && <span className="ml-2 font-mono text-xs text-amber-dim">{countdown}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="rounded-lg border border-ink-950/10 p-4">
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-text-onPaper/50 mb-3">Your order</h2>
        <div className="space-y-2">
          {activeItems.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.quantity}× {item.item_name}
                {Number(item.discount_amount) > 0 && (
                  <span className="ml-1 text-xs text-text-onPaper/50">
                    (−{currency} {Number(item.discount_amount).toLocaleString('en-IN')})
                  </span>
                )}
              </span>
              <span className="font-mono">
                {currency} {Math.max(item.unit_price * item.quantity - Number(item.discount_amount), 0).toLocaleString('en-IN')}
              </span>
            </div>
          ))}
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between text-sm text-text-onPaper/60">
              <span>Discount</span>
              <span className="font-mono">
                − {currency} {Number(order.discount_amount).toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-between font-display font-bold mt-3 pt-3 border-t border-ink-950/10">
          <span>Total</span>
          <span className="font-mono">
            {currency} {total.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
      </div>

      {tableQrToken && <QuickActions tableId={tableId} tableQrToken={tableQrToken} />}
    </div>
  );
}

function getCountdown(order: Order, now: number): string | null {
  if (!order.estimated_minutes || !order.accepted_at) return null;
  if (order.status !== 'accepted' && order.status !== 'preparing') return null;

  const target = new Date(order.accepted_at).getTime() + order.estimated_minutes * 60_000;
  const remainingMs = target - now;

  if (remainingMs <= 0) return 'Any moment now';

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  return `~${minutes}:${seconds.toString().padStart(2, '0')}`;
}
