'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ServiceRequestType } from '@/types/database';

const ACTIONS: { type: ServiceRequestType; label: string; icon: string }[] = [
  { type: 'waiter', label: 'Call Waiter', icon: '🙋' },
  { type: 'water', label: 'Water', icon: '💧' },
  { type: 'bill', label: 'Bill', icon: '🧾' },
];

export function QuickActions({ tableId, tableQrToken }: { tableId: string; tableQrToken: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ServiceRequestType | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<ServiceRequestType>>(new Set());

  // Track which request types are already active for this table (live, via
  // realtime) so those buttons disable and restyle instead of re-firing the
  // RPC. The database dedupes regardless — this is UX, not the guard.
  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('service_requests')
      .select('type, status')
      .eq('table_id', tableId)
      .in('status', ['pending', 'claimed'])
      .then(({ data }) => {
        setActiveTypes(new Set((data ?? []).map((r: { type: ServiceRequestType }) => r.type)));
      });

    const channel = supabase
      .channel(`quick-actions-${tableId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_requests', filter: `table_id=eq.${tableId}` },
        (payload) => {
          const row = payload.new as { type: ServiceRequestType; status: string } | null;
          if (!row) return; // DELETE payloads have no new row
          setActiveTypes((prev) => {
            const next = new Set(prev);
            if (row.status === 'pending' || row.status === 'claimed') next.add(row.type);
            else next.delete(row.type);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  async function request(type: ServiceRequestType, label: string) {
    if (activeTypes.has(type)) return; // already requested — button should be disabled anyway
    setPending(type);
    const supabase = createClient();
    const { error } = await supabase.rpc('create_service_request', { p_qr_token: tableQrToken, p_type: type });
    setPending(null);
    setOpen(false);

    if (error?.message.includes('ALREADY_REQUESTED')) {
      setActiveTypes((prev) => new Set(prev).add(type)); // sync UI with the DB's truth
      setToast(`You have already requested ${label}. Please wait, our staff is on the way!`);
      return;
    }
    if (error) {
      setToast(`Couldn't send that request — try again.`);
      return;
    }
    setActiveTypes((prev) => new Set(prev).add(type));
    setToast(`${label} request sent`);
  }

  return (
    <>
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-ink-950 text-paper text-sm px-4 py-2 rounded-full shadow-lg" role="status">
          {toast}
        </div>
      )}

      <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2">
        {open &&
          ACTIONS.map((a) => {
            const isActive = activeTypes.has(a.type);
            return (
              <button
                key={a.type}
                onClick={() => request(a.type, a.label)}
                disabled={pending !== null || isActive}
                aria-disabled={isActive}
                title={isActive ? 'Already requested — staff is on the way' : undefined}
                className={`flex items-center gap-2 shadow-lg rounded-full pl-3 pr-4 py-2 text-sm font-display border transition-colors ${
                  isActive
                    ? 'bg-amber/20 border-amber/50 text-ink-950'
                    : 'bg-paper text-text-onPaper border-ink-950/10 hover:bg-ink-950/5 disabled:opacity-60'
                }`}
              >
                <span aria-hidden>{a.icon}</span>
                {pending === a.type ? 'Sending…' : isActive ? `${a.label} — requested ✓` : a.label}
              </button>
            );
          })}

        <button
          onClick={() => setOpen((s) => !s)}
          aria-expanded={open}
          aria-label={open ? 'Close quick actions' : 'Open quick actions'}
          className="h-12 w-12 rounded-full bg-amber text-ink-950 shadow-lg flex items-center justify-center text-xl font-display"
        >
          {open ? '×' : '+'}
        </button>
      </div>
    </>
  );
}
