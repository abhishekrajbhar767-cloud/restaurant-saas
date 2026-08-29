'use client';

import { useElapsed } from '@/lib/shared/use-elapsed';
import type { ServiceRequestWithTable } from '@/types/database';

const TYPE_LABEL: Record<ServiceRequestWithTable['type'], string> = {
  waiter: 'needs a Waiter',
  water: 'needs Water',
  bill: 'wants the Bill',
};
const TYPE_ICON: Record<ServiceRequestWithTable['type'], string> = { waiter: '🙋', water: '💧', bill: '🧾' };

export function RequestCard({
  request,
  canAccept,
  isMine,
  onAccept,
  onResolve,
}: {
  request: ServiceRequestWithTable;
  canAccept: boolean;
  isMine: boolean;
  onAccept: () => void;
  onResolve: () => void;
}) {
  const elapsed = useElapsed(request.created_at);

  return (
    <div className={`card p-4 flex items-center gap-4 ${request.status === 'claimed' && !isMine ? 'opacity-50' : ''}`}>
      <span className="text-2xl shrink-0" aria-hidden>
        {TYPE_ICON[request.type]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold">
          Table {request.table_number} <span className="font-normal text-text-muted">{TYPE_LABEL[request.type]}</span>
        </div>
        <div className="text-xs text-text-muted">{elapsed}</div>
      </div>

      {request.status === 'pending' && (
        <button onClick={onAccept} disabled={!canAccept} className="btn-primary text-sm shrink-0 disabled:opacity-40">
          Accept
        </button>
      )}

      {request.status === 'claimed' && isMine && (
        <button onClick={onResolve} className="btn-secondary text-sm shrink-0 text-success border-success/40">
          Resolve
        </button>
      )}

      {request.status === 'claimed' && !isMine && <span className="text-xs text-text-muted shrink-0">Claimed</span>}
    </div>
  );
}
