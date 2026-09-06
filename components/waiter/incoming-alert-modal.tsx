'use client';

import type { StaffAlertPayload } from '@/lib/native/staff-alert';

export function IncomingAlertModal({
  alert,
  onAccept,
}: {
  alert: StaffAlertPayload;
  onAccept: () => void;
}) {
  const pulseLabel = alert.type === 'KITCHEN_READY' ? 'Ready' : 'Call';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-ink-950/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staff-alert-title"
    >
      <div className="card w-full max-w-md overflow-hidden border-amber/40 shadow-panel">
        <div className="bg-ink-800 px-6 pt-8 pb-6 text-center">
          <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border-2 border-amber bg-amber/15 animate-pulse">
            <span className="font-display text-lg font-bold uppercase tracking-wide text-amber">{pulseLabel}</span>
          </div>
          <p className="text-xs font-display font-bold uppercase tracking-[0.2em] text-text-muted">
            {alert.type === 'KITCHEN_READY' ? 'Kitchen' : 'Floor'}
          </p>
          <h2 id="staff-alert-title" className="mt-2 font-display text-2xl font-bold text-text">
            {alert.title}
          </h2>
          <p className="mt-2 text-sm text-text-muted">{alert.body}</p>
        </div>
        <div className="p-5">
          <button type="button" onClick={onAccept} className="btn-primary w-full py-4 text-lg font-bold">
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
