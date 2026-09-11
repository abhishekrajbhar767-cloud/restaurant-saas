'use client';

import { useState } from 'react';
import { useElapsed } from '@/lib/shared/use-elapsed';
import type { OrderWithItems } from '@/types/database';

export function OrderApprovalCard({
  order,
  isPending,
  onApprove,
  onReject,
}: {
  order: OrderWithItems;
  isPending: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const elapsed = useElapsed(order.created_at);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className="card border-info/40 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="inline-block rounded-full bg-info/20 px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide text-info">
            Needs approval
          </span>
          <div className="mt-1 font-mono text-lg font-bold">Table {order.table_number}</div>
        </div>
        <div className="text-xs text-text-muted">{elapsed}</div>
      </div>

      <ul className="text-sm space-y-1">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="font-mono text-amber">{item.quantity}×</span> {item.item_name}
            {item.special_instructions && (
              <div className="text-xs text-text-muted pl-5 italic">&ldquo;{item.special_instructions}&rdquo;</div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2 border-t border-line flex flex-col gap-2">
        {rejecting ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="field-input text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onReject(reason);
                  setRejecting(false);
                  setReason('');
                }}
                disabled={isPending}
                className="btn-primary flex-1 bg-danger text-sm hover:bg-danger disabled:opacity-60"
              >
                Confirm reject
              </button>
              <button onClick={() => setRejecting(false)} disabled={isPending} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onApprove} disabled={isPending} className="btn-primary flex-1 text-sm">
              {isPending ? 'Working…' : 'Approve'}
            </button>
            <button
              onClick={() => setRejecting(true)}
              disabled={isPending}
              className="rounded border border-danger/50 px-3.5 py-2.5 text-sm font-display font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
