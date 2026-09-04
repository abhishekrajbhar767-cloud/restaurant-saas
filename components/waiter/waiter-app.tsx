'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RequestCard } from '@/components/waiter/request-card';
import { NewOrderSheet } from '@/components/waiter/new-order-sheet';
import { RINGTONE_SRC } from '@/lib/shared/ringtone';
import { releaseWakeLock, requestWakeLock } from '@/lib/shared/wake-lock';
import type {
  MenuCategory,
  MenuItem,
  RestaurantTable,
  ServiceRequestWithTable,
  ServiceRequest,
  WaiterStatusRow,
  WaiterAvailability,
} from '@/types/database';

// 1s buzz, 0.5s rest, twice — refired every 3s by the interval below.
const VIBRATE_PATTERN: number[] = [1000, 500, 1000, 500];

export function WaiterApp({
  restaurantId,
  memberId,
  initialAvailability,
  initialRequests,
  tables,
  categories,
  menuItems,
  currency,
  askName,
  askMobile,
}: {
  restaurantId: string;
  memberId: string;
  initialAvailability: WaiterAvailability;
  initialRequests: ServiceRequestWithTable[];
  tables: RestaurantTable[];
  categories: MenuCategory[];
  menuItems: MenuItem[];
  currency: string;
  askName: boolean;
  askMobile: boolean;
}) {
  const [availability, setAvailability] = useState<WaiterAvailability>(initialAvailability);
  const [requests, setRequests] = useState<ServiceRequestWithTable[]>(initialRequests);
  const [toast, setToast] = useState<string | null>(null);
  const [togglePending, setTogglePending] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const vibrateTimerRef = useRef<number | null>(null);
  const shouldRingRef = useRef(false);

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
      .channel(`waiter-${restaurantId}-${memberId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'service_requests', filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const req = payload.new as ServiceRequest;
          const { data: table } = await supabase.from('tables').select('table_number').eq('id', req.table_id).maybeSingle().returns<{ table_number: string }>();
          setRequests((prev) => [...prev, { ...req, table_number: table?.table_number ?? '—' }]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'service_requests', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const updated = payload.new as ServiceRequest;
          setRequests((prev) =>
            updated.status === 'resolved' || updated.status === 'cancelled'
              ? prev.filter((r) => r.id !== updated.id)
              : prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'waiter_status', filter: `member_id=eq.${memberId}` },
        (payload) => {
          setAvailability((payload.new as WaiterStatusRow).availability);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, memberId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  // Phone-call ring: the native loop attribute keeps the sound ringing; this
  // effect only decides when it sounds. Stop = pause + rewind to 0.
  useEffect(() => {
    const audio = audioRef.current;
    shouldRingRef.current = pendingCount > 0 && availability === 'free';
    if (!audio) return;
    if (shouldRingRef.current) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [pendingCount, availability]);

  // Vibration is fully independent of audio (a phone on silent still buzzes)
  // and keeps going while ANY request is still waiting.
  useEffect(() => {
    if (pendingCount > 0) {
      if (vibrateTimerRef.current === null) {
        navigator.vibrate?.(VIBRATE_PATTERN);
        vibrateTimerRef.current = window.setInterval(() => navigator.vibrate?.(VIBRATE_PATTERN), 3000);
      }
    } else {
      stopVibrationNow();
    }
    return () => stopVibrationNow();
  }, [pendingCount]);

  // Keep the screen on so mobile browsers don't throttle the loops to death.
  // The browser releases the lock whenever the tab is hidden, so re-request
  // it when the waiter comes back to the tab.
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

  async function handleToggleAvailability() {
    setTogglePending(true);
    const next: WaiterAvailability = availability === 'free' ? 'busy' : 'free';
    const supabase = createClient();
    const { error } = await supabase.rpc('set_waiter_availability', { p_restaurant_id: restaurantId, p_availability: next });
    setTogglePending(false);
    if (!error) {
      setAvailability(next);
      if (next === 'busy') {
        // Switching to BUSY must silence the ring instantly, not next render.
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      }
    }
  }

  async function handleAccept(requestId: string) {
    const supabase = createClient();
    const { data: claimed, error } = await supabase.rpc('claim_service_request', { p_request_id: requestId });
    if (error) {
      setToast("Couldn't claim that — try again.");
      return;
    }
    if (!claimed) {
      setToast('Task already claimed');
      return;
    }
    setAvailability('busy');
    // Accepting a request must stop the call-style alerts immediately.
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (!requests.some((r) => r.status === 'pending' && r.id !== requestId)) stopVibrationNow();
    setToast('You got it — head to the table');
  }

  async function handleResolve(requestId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc('resolve_service_request', { p_request_id: requestId });
    if (error) {
      setToast('Could not resolve — try again.');
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    setAvailability('free');
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const claimed = requests.filter((r) => r.status === 'claimed');

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <audio ref={audioRef} src={RINGTONE_SRC} loop preload="auto" />

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-ink-800 text-text text-sm px-4 py-2 rounded-full shadow-lg border border-line" role="status">
          {toast}
        </div>
      )}

      <button
        onClick={handleToggleAvailability}
        disabled={togglePending}
        className={`w-full rounded-lg py-5 font-display text-xl font-bold transition-colors ${
          availability === 'free' ? 'bg-success text-ink-950' : 'bg-danger text-ink-950'
        } disabled:opacity-60`}
        aria-pressed={availability === 'free'}
      >
        {availability === 'free' ? 'FREE' : availability === 'busy' ? 'BUSY' : 'OFFLINE — tap to go Free'}
      </button>

      <button
        onClick={() => setOrderSheetOpen(true)}
        className="w-full rounded-lg border border-amber/40 bg-amber/10 py-3 font-display font-bold text-amber"
      >
        + New Order for Table
      </button>

      {orderSheetOpen && (
        <NewOrderSheet
          tables={tables}
          categories={categories}
          items={menuItems}
          currency={currency}
          askName={askName}
          askMobile={askMobile}
          onClose={() => setOrderSheetOpen(false)}
          onPlaced={(message) => {
            setOrderSheetOpen(false);
            setToast(message);
          }}
        />
      )}

      <section>
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-text-muted mb-2">
          Waiting ({pending.length})
        </h2>
        <div className="space-y-2">
          {pending.map((r) => (
            <RequestCard key={r.id} request={r} canAccept={availability === 'free'} isMine={false} onAccept={() => handleAccept(r.id)} onResolve={() => {}} />
          ))}
          {pending.length === 0 && <p className="text-sm text-text-muted">No open requests right now.</p>}
        </div>
      </section>

      {claimed.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-text-muted mb-2">In progress</h2>
          <div className="space-y-2">
            {claimed.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                canAccept={false}
                isMine={r.claimed_by === memberId}
                onAccept={() => {}}
                onResolve={() => handleResolve(r.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
