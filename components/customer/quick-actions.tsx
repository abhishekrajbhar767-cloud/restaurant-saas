'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ServiceRequestType } from '@/types/database';

const ACTIONS: { type: ServiceRequestType; label: string; icon: string }[] = [
  { type: 'waiter', label: 'Call Waiter', icon: '🙋' },
  { type: 'water', label: 'Water', icon: '💧' },
  { type: 'bill', label: 'Bill', icon: '🧾' },
];

export function QuickActions({ tableQrToken }: { tableQrToken: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ServiceRequestType | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function request(type: ServiceRequestType, label: string) {
    setPending(type);
    const supabase = createClient();
    const { error } = await supabase.rpc('create_service_request', { p_qr_token: tableQrToken, p_type: type });
    setPending(null);
    setOpen(false);
    setToast(error ? `Couldn't send that request — try again.` : `${label} request sent`);
    setTimeout(() => setToast(null), 3000);
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
          ACTIONS.map((a) => (
            <button
              key={a.type}
              onClick={() => request(a.type, a.label)}
              disabled={pending !== null}
              className="flex items-center gap-2 bg-paper text-text-onPaper shadow-lg rounded-full pl-3 pr-4 py-2 text-sm font-display border border-ink-950/10 hover:bg-ink-950/5 disabled:opacity-60"
            >
              <span aria-hidden>{a.icon}</span>
              {pending === a.type ? 'Sending…' : a.label}
            </button>
          ))}

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
