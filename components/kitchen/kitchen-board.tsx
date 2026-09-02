'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { acceptOrder, markReady, markServed, cancelOrder } from '@/lib/kitchen/actions';
import { OrderTicket } from '@/components/kitchen/order-ticket';
import { RINGTONE_SRC } from '@/lib/shared/ringtone';
import { releaseWakeLock, requestWakeLock } from '@/lib/shared/wake-lock';
import type { OrderWithItems, Order } from '@/types/database';

// 1s buzz, 0.5s rest, twice — refired every 3s by the interval below.
const VIBRATE_PATTERN: number[] = [1000, 500, 1000, 500];

export function KitchenBoard({ restaurantId, initialOrders }: { restaurantId: string; initialOrders: OrderWithItems[] }) {
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [shiftActive, setShiftActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const vibrateTimerRef = useRef<number | null>(null);
  const shouldRingRef = useRef(false);
  // Orders with a transition RPC in flight — blocks the double-tap that used
  // to hit the state machine twice and throw "Invalid transition from ready
  // to ready".
  const transitioningRef = useRef<Set<string>>(new Set());

  function stopVibrationNow() {
    if (vibrateTimerRef.current !== null) {
      clearInterval(vibrateTimerRef.current);
      vibrateTimerRef.current = null;
    }
    navigator.vibrate?.(0);
  }

  // Mobile autoplay policy: an <audio> element can only be played after a
  // real user gesture. On the page's first interaction, "prime" the element
  // by playing and immediately pausing again (when nothing is waiting), so
  // later programmatic play() calls from the realtime path are allowed.
  useEffect(() => {
    const prime = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio
        .play()
        .then(() => {
          if (!shouldRingRef.current) audio.pause();
        })
        .catch(() => {});
    };
    window.addEventListener('pointerdown', prime, { once: true });
    window.addEventListener('touchend', prime, { once: true });
    window.addEventListener('keydown', prime, { once: true });
    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('touchend', prime);
      window.removeEventListener('keydown', prime);
    };
  }, []);

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
            supabase.from('tables').select('table_number').eq('id', newOrder.table_id).maybeSingle().returns<{ table_number: string }>(),
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
  const newCount = newOrders.length;

  // Phone-call ring: the native loop attribute keeps the sound ringing; this
  // effect only decides when it sounds. Rings while new KOTs are waiting and
  // the shift is active; stops the moment the queue empties (accept flows
  // through here via the optimistic update in handleAccept).
  useEffect(() => {
    const audio = audioRef.current;
    shouldRingRef.current = shiftActive && newCount > 0;
    if (!audio) return;
    if (shouldRingRef.current) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [shiftActive, newCount]);

  // Vibration is fully independent of audio (a tablet on silent still buzzes)
  // and keeps going while new KOTs are still waiting.
  useEffect(() => {
    if (shiftActive && newCount > 0) {
      if (vibrateTimerRef.current === null) {
        navigator.vibrate?.(VIBRATE_PATTERN);
        vibrateTimerRef.current = window.setInterval(() => navigator.vibrate?.(VIBRATE_PATTERN), 3000);
      }
    } else {
      stopVibrationNow();
    }
    return () => stopVibrationNow();
  }, [shiftActive, newCount]);

  // Keep the kitchen display on so mobile browsers don't throttle the loops
  // to death. The browser releases the lock whenever the tab is hidden, so
  // re-request it when the display comes back.
  useEffect(() => {
    void requestWakeLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void releaseWakeLock();
    };
  }, []);

  // Unmount safety net: silence audio and stop vibration on the way out.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      stopVibrationNow();
    };
  }, []);

  function handleStartShift() {
    setShiftActive(true);
    // The click is the user gesture — prime the audio element so realtime
    // play() calls are allowed from now on (mirrors the waiter dashboard).
    const audio = audioRef.current;
    if (audio) {
      audio
        .play()
        .then(() => {
          if (!shouldRingRef.current) audio.pause();
        })
        .catch(() => {});
    }
  }

  async function handleAccept(orderId: string, minutes: number) {
    const current = orders.find((o) => o.id === orderId);
    if (!current || current.status !== 'placed' || transitioningRef.current.has(orderId)) return; // already accepted / in flight
    transitioningRef.current.add(orderId);

    const { error } = await acceptOrder(orderId, minutes);
    transitioningRef.current.delete(orderId);
    if (error) {
      setError(error);
      return;
    }
    // Optimistic local update: the KOT leaves "New" instantly, which stops
    // the ring/vibration right away (the realtime UPDATE confirms later).
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'accepted' as const } : o)));
    if (!orders.some((o) => o.status === 'placed' && o.id !== orderId)) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      stopVibrationNow();
    }
  }

  async function handleReady(orderId: string) {
    const current = orders.find((o) => o.id === orderId);
    if (!current || (current.status !== 'accepted' && current.status !== 'preparing') || transitioningRef.current.has(orderId)) return;
    transitioningRef.current.add(orderId);

    const { error } = await markReady(orderId);
    transitioningRef.current.delete(orderId);
    if (error) {
      setError(error);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'ready' as const } : o)));
  }

  async function handleServed(orderId: string) {
    const current = orders.find((o) => o.id === orderId);
    if (!current || current.status !== 'ready' || transitioningRef.current.has(orderId)) return;
    transitioningRef.current.add(orderId);

    const { error } = await markServed(orderId);
    transitioningRef.current.delete(orderId);
    if (error) {
      setError(error);
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  async function handleCancel(orderId: string) {
    const current = orders.find((o) => o.id === orderId);
    if (!current || !['placed', 'accepted', 'preparing'].includes(current.status) || transitioningRef.current.has(orderId)) return;
    transitioningRef.current.add(orderId);

    const reason = window.prompt('Reason for cancelling this order (optional):') ?? '';
    const { error } = await cancelOrder(orderId, reason);
    transitioningRef.current.delete(orderId);
    if (error) {
      setError(error);
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  return (
    <>
      <audio ref={audioRef} src={RINGTONE_SRC} loop preload="auto" />

      {!shiftActive ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-text-muted text-sm max-w-xs text-center">
            Start your shift to enable live order alerts. Browsers block sound until you interact with the page.
          </p>
          <button onClick={handleStartShift} className="btn-primary text-lg px-8 py-3">
            Start Shift
          </button>
        </div>
      ) : (
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
            <Column title="New" count={newCount} accent>
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
      )}
    </>
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
