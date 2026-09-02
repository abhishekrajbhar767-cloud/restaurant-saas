'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RequestCard } from '@/components/waiter/request-card';
import { playRequestAlert, unlockAlertSound } from '@/lib/waiter/alert-sound';
import type { ServiceRequestWithTable, ServiceRequest, WaiterStatusRow, WaiterAvailability } from '@/types/database';

export function WaiterApp({
  restaurantId,
  memberId,
  initialAvailability,
  initialRequests,
}: {
  restaurantId: string;
  memberId: string;
  initialAvailability: WaiterAvailability;
  initialRequests: ServiceRequestWithTable[];
}) {
  const [availability, setAvailability] = useState<WaiterAvailability>(initialAvailability);
  const [requests, setRequests] = useState<ServiceRequestWithTable[]>(initialRequests);
  const [toast, setToast] = useState<string | null>(null);
  const [togglePending, setTogglePending] = useState(false);

  // Mobile browsers keep the AudioContext suspended until a real user
  // gesture, so unlock on the page's first interaction of any kind — tapping
  // the FREE/BUSY button, accepting a request, anything.
  useEffect(() => {
    const unlock = () => unlockAlertSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchend', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('keydown', unlock);
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
          if (req.status === 'pending') playRequestAlert();
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

  async function handleToggleAvailability() {
    unlockAlertSound(); // this tap is a user gesture — safe place to unlock audio
    setTogglePending(true);
    const next: WaiterAvailability = availability === 'free' ? 'busy' : 'free';
    const supabase = createClient();
    const { error } = await supabase.rpc('set_waiter_availability', { p_restaurant_id: restaurantId, p_availability: next });
    setTogglePending(false);
    if (!error) setAvailability(next);
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