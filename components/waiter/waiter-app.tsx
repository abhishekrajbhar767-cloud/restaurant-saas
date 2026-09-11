'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RequestCard } from '@/components/waiter/request-card';
import { NewOrderSheet } from '@/components/waiter/new-order-sheet';
import { TableStatusBoard } from '@/components/waiter/table-status-board';
import { OrderApprovalCard } from '@/components/waiter/order-approval-card';
import { Capacitor } from '@capacitor/core';
import { RINGTONE_SRC } from '@/lib/shared/ringtone';
import { assignTableToSelf, setTableStatus } from '@/lib/shared/table-status';
import { approveOrder, rejectOrder } from '@/lib/waiter/order-approval';
import { releaseWakeLock, requestWakeLock } from '@/lib/shared/wake-lock';
import { StaffAlertsHost, handleStaffAlert, staffAlertFromReadyOrder, staffAlertFromServiceRequest } from '@/components/waiter/staff-alerts-host';
import { stopStaffRingtone } from '@/lib/native/NotificationService';
import type {
  MenuCategory,
  MenuItem,
  Order,
  OrderItem,
  OrderWithItems,
  RestaurantTable,
  ServiceRequestWithTable,
  ServiceRequest,
  TableStatus,
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
  initialTables,
  initialPendingApprovals,
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
  initialTables: RestaurantTable[];
  initialPendingApprovals: OrderWithItems[];
  categories: MenuCategory[];
  menuItems: MenuItem[];
  currency: string;
  askName: boolean;
  askMobile: boolean;
}) {
  const [availability, setAvailability] = useState<WaiterAvailability>(initialAvailability);
  const [requests, setRequests] = useState<ServiceRequestWithTable[]>(initialRequests);
  const [tables, setTables] = useState<RestaurantTable[]>(initialTables);
  const [pendingApprovals, setPendingApprovals] = useState<OrderWithItems[]>(initialPendingApprovals);
  const [approvalActionIds, setApprovalActionIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingTableIds, setPendingTableIds] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [togglePending, setTogglePending] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  // Seeded on mount rather than at render so the server pass and the first
  // client pass agree — Date.now() during SSR would hydrate mismatched.
  const [nowMs, setNowMs] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const vibrateTimerRef = useRef<number | null>(null);
  const shouldRingRef = useRef(false);
  // Guards a second tap landing while the first write is still in flight —
  // without it the rollback path can restore a status the waiter has already
  // moved on from.
  const tablesInFlightRef = useRef<Set<string>>(new Set());
  const availabilityRef = useRef(availability);
  availabilityRef.current = availability;

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
          const tableNumber = table?.table_number ?? '—';
          setRequests((prev) => [...prev, { ...req, table_number: tableNumber }]);
          if (req.status === 'pending' && availabilityRef.current === 'free') {
            handleStaffAlert(staffAlertFromServiceRequest(req, tableNumber));
          }
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
      // A new QR order lands here as pending_waiter_approval when the
      // restaurant has approval turned on. Only surface it if this waiter
      // owns the table (or nobody does yet) — a table assigned to someone
      // else is their queue, not this one.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const order = payload.new as Order;
          if (order.status !== 'pending_waiter_approval') return;

          const [{ data: table }, { data: items }] = await Promise.all([
            supabase.from('tables').select('table_number, assigned_waiter_id').eq('id', order.table_id).maybeSingle().returns<{
              table_number: string;
              assigned_waiter_id: string | null;
            }>(),
            supabase.from('order_items').select('*').eq('order_id', order.id).returns<OrderItem[]>(),
          ]);
          if (table && table.assigned_waiter_id !== null && table.assigned_waiter_id !== memberId) return;

          setPendingApprovals((prev) =>
            prev.some((o) => o.id === order.id) ? prev : [...prev, { ...order, items: items ?? [], table_number: table?.table_number ?? '—' }]
          );
          setToast(`Table ${table?.table_number ?? '—'} — new order needs your approval`);
          navigator.vibrate?.(VIBRATE_PATTERN);
        }
      )
      // Any device can seat or clear a table — the manager's live map, another
      // waiter's phone, or create_order seating a table implicitly — so the
      // board follows the row rather than only its own taps.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const order = payload.new as Order;

          if (order.status !== 'pending_waiter_approval') {
            // Approved/rejected/voided elsewhere (another device, a manager) —
            // this waiter's approval queue must drop it either way.
            setPendingApprovals((prev) => prev.filter((o) => o.id !== order.id));
          }

          if (order.status !== 'ready') return;
          const { data: table } = await supabase.from('tables').select('table_number').eq('id', order.table_id).maybeSingle().returns<{ table_number: string }>();
          handleStaffAlert(staffAlertFromReadyOrder(order, table?.table_number ?? '—'));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const removed = payload.old as Partial<RestaurantTable>;
            setTables((prev) => prev.filter((t) => t.id !== removed.id));
            return;
          }
          const table = payload.new as RestaurantTable;
          setTables((prev) =>
            prev.some((t) => t.id === table.id) ? prev.map((t) => (t.id === table.id ? { ...t, ...table } : t)) : [...prev, table]
          );
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

  // The seated timers are rendered in whole minutes, so a 15s tick keeps them
  // within a quarter-minute of the truth without re-rendering constantly.
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // getRestaurantTables orders by table_number as text, which puts 10 before
  // 2. Inactive tables are filtered here rather than on the server so a table
  // being retired mid-shift leaves the board over realtime.
  const activeTables = useMemo(
    () =>
      tables
        .filter((table) => table.is_active)
        .sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true })),
    [tables]
  );

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  // Phone-call ring: the native loop attribute keeps the sound ringing; this
  // effect only decides when it sounds. Stop = pause + rewind to 0.
  // On Capacitor, NotificationService owns the loop (Native Audio + the
  // Android foreground service) so this <audio> stays silent there.
  useEffect(() => {
    const audio = audioRef.current;
    shouldRingRef.current = pendingCount > 0 && availability === 'free';
    if (Capacitor.isNativePlatform()) return;
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
        void stopStaffRingtone();
      }
    }
  }

  // Optimistic so the tap feels instant on a phone; the realtime UPDATE that
  // follows is what everyone else's board reacts to, and a rejected write is
  // rolled back rather than left showing a status the database never took.
  async function handleSetTableStatus(tableId: string, status: TableStatus) {
    const current = tables.find((t) => t.id === tableId);
    if (!current || current.status === status || tablesInFlightRef.current.has(tableId)) return;

    tablesInFlightRef.current.add(tableId);
    setPendingTableIds((prev) => new Set(prev).add(tableId));
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status } : t)));

    const { error } = await setTableStatus(tableId, status);

    tablesInFlightRef.current.delete(tableId);
    setPendingTableIds((prev) => {
      const next = new Set(prev);
      next.delete(tableId);
      return next;
    });

    if (error) {
      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status: current.status } : t)));
      setToast(`Couldn't update Table ${current.table_number} — try again.`);
      return;
    }
    setToast(
      status === 'empty'
        ? `Table ${current.table_number} is free`
        : `Table ${current.table_number} is seated`
    );
  }

  async function handleAssignToSelf(tableId: string) {
    const current = tables.find((t) => t.id === tableId);
    if (!current || tablesInFlightRef.current.has(tableId)) return;

    tablesInFlightRef.current.add(tableId);
    setPendingTableIds((prev) => new Set(prev).add(tableId));

    const { error } = await assignTableToSelf(tableId);

    tablesInFlightRef.current.delete(tableId);
    setPendingTableIds((prev) => {
      const next = new Set(prev);
      next.delete(tableId);
      return next;
    });

    if (error) {
      setToast(`Couldn't assign Table ${current.table_number} — try again.`);
      return;
    }
    // The realtime '*' subscription on tables applies the authoritative
    // assigned_waiter_id; this just gives the tap instant feedback.
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, assigned_waiter_id: memberId } : t)));
    setToast(`Table ${current.table_number} assigned to you`);
  }

  async function handleApproveOrder(orderId: string) {
    if (approvalActionIds.has(orderId)) return;
    setApprovalActionIds((prev) => new Set(prev).add(orderId));

    const { error } = await approveOrder(orderId);

    setApprovalActionIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });

    if (error) {
      setToast("Couldn't approve that order — try again.");
      return;
    }
    setPendingApprovals((prev) => prev.filter((o) => o.id !== orderId));
    setToast('Order approved — sent to the kitchen.');
  }

  async function handleRejectOrder(orderId: string, reason: string) {
    if (approvalActionIds.has(orderId)) return;
    setApprovalActionIds((prev) => new Set(prev).add(orderId));

    const { error } = await rejectOrder(orderId, reason);

    setApprovalActionIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });

    if (error) {
      setToast("Couldn't reject that order — try again.");
      return;
    }
    setPendingApprovals((prev) => prev.filter((o) => o.id !== orderId));
    setToast('Order rejected.');
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
    void stopStaffRingtone();
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
      <StaffAlertsHost restaurantId={restaurantId} availability={availability} onAcceptRequest={handleAccept} />

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
          tables={activeTables}
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

      {pendingApprovals.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-info mb-2">
            Needs Approval ({pendingApprovals.length})
          </h2>
          <div className="space-y-2">
            {pendingApprovals.map((order) => (
              <OrderApprovalCard
                key={order.id}
                order={order}
                isPending={approvalActionIds.has(order.id)}
                onApprove={() => handleApproveOrder(order.id)}
                onReject={(reason) => handleRejectOrder(order.id, reason)}
              />
            ))}
          </div>
        </section>
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

      {/* Below the queue on purpose: seating and clearing happens when guests
          arrive or leave, while a waiting request is ringing right now. */}
      <TableStatusBoard
        tables={activeTables}
        pendingIds={pendingTableIds}
        nowMs={nowMs}
        currentMemberId={memberId}
        onSetStatus={handleSetTableStatus}
        onAssignToSelf={handleAssignToSelf}
      />
    </div>
  );
}
