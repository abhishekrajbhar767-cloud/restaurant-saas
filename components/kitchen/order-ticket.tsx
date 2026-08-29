'use client';

import { useState } from 'react';
import { useElapsed } from '@/lib/shared/use-elapsed';
import type { OrderWithItems } from '@/types/database';

const PREP_OPTIONS = [5, 10, 15, 20];

export function OrderTicket({
  order,
  onAccept,
  onReady,
  onServed,
  onCancel,
}: {
  order: OrderWithItems;
  onAccept?: (minutes: number) => void;
  onReady?: () => void;
  onServed?: () => void;
  onCancel?: () => void;
}) {
  const elapsed = useElapsed(order.created_at);
  const [pickingTime, setPickingTime] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-lg font-bold">#{order.order_number}</div>
          <div className="text-xs text-text-muted">Table {order.table_number}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-text-muted">{elapsed}</div>
          {order.estimated_minutes && <div className="text-xs text-amber font-mono">{order.estimated_minutes}m quoted</div>}
        </div>
      </div>

      <ul className="text-sm space-y-1">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="font-mono text-amber">{item.quantity}×</span> {item.item_name}
            {item.special_instructions && <div className="text-xs text-text-muted pl-5 italic">&ldquo;{item.special_instructions}&rdquo;</div>}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2 border-t border-line flex flex-col gap-2">
        {onAccept &&
          (pickingTime ? (
            <div className="flex flex-wrap gap-2 items-center">
              {PREP_OPTIONS.map((m) => (
                <button key={m} onClick={() => onAccept(m)} className="btn-secondary text-sm px-2.5 py-1">
                  {m}m
                </button>
              ))}
              <input
                type="number"
                min={1}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="Custom"
                className="field-input w-20 py-1 text-sm"
              />
              {customMinutes && (
                <button onClick={() => onAccept(Number(customMinutes))} className="btn-primary text-sm px-2.5 py-1">
                  Go
                </button>
              )}
            </div>
          ) : (
            <button onClick={() => setPickingTime(true)} className="btn-primary text-sm">
              Accept &amp; Set Time
            </button>
          ))}

        {onReady && (
          <button onClick={onReady} className="btn-primary text-sm">
            Mark Ready
          </button>
        )}

        {onServed && (
          <button onClick={onServed} className="btn-primary text-sm">
            Mark Served
          </button>
        )}

        {onCancel && (
          <button onClick={onCancel} className="text-xs text-danger underline underline-offset-2 self-start">
            Cancel order
          </button>
        )}
      </div>
    </div>
  );
}
