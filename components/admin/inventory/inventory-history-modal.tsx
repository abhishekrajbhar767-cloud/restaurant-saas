'use client';

import { useEffect, useState } from 'react';
import { getInventoryLogs } from '@/app/admin/inventory/actions';
import { formatStock, type InventoryResult } from '@/lib/inventory/validation';
import { InventoryModal } from './inventory-modal';
import type { InventoryChangeType, InventoryItem, InventoryLog } from '@/types/database';

const CHANGE_LABELS: Record<InventoryChangeType, string> = {
  manual_restock: 'Manual restock', auto_deduct: 'Auto deduction', waste: 'Waste', correction: 'Correction',
};

export function InventoryHistoryModal({ item, timeZone, onClose }: {
  item: InventoryItem; timeZone: string; onClose: () => void;
}) {
  const [result, setResult] = useState<InventoryResult<InventoryLog[]> | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null);
    void getInventoryLogs(item.id).then((data) => { if (active) setResult(data); }).catch(() => {
      if (active) setResult({ data: null, error: 'Could not load stock history. Please try again.' });
    });
    return () => { active = false; };
  }, [item.id, attempt]);

  return (
    <InventoryModal title={`Stock history · ${item.name}`} onClose={onClose}>
      <p className="mb-4 text-xs text-text-muted">Latest 50 adjustments · Times shown in {timeZone}</p>
      {!result && <p role="status" className="py-6 text-sm text-text-muted">Loading stock history…</p>}
      {result?.error && <div role="alert" className="space-y-3 text-sm text-danger">
        <p>{result.error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="btn-secondary">Try again</button>
      </div>}
      {result?.data?.length === 0 && <p className="py-6 text-sm text-text-muted">No stock adjustments yet.</p>}
      {result?.data && <ol className="divide-y divide-line">
        {result.data.map((log) => <li key={log.id} className="space-y-2 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{CHANGE_LABELS[log.change_type]}</span>
            <span className="font-mono tabular-nums">{log.change_type === 'manual_restock' ? '+' : ''}{formatStock(log.quantity)} {item.unit}</span>
          </div>
          <time dateTime={log.created_at} className="block text-xs text-text-muted">
            {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(log.created_at))}
          </time>
          {log.notes && <p className="whitespace-pre-wrap break-words text-text-muted">{log.notes}</p>}
        </li>)}
      </ol>}
    </InventoryModal>
  );
}
