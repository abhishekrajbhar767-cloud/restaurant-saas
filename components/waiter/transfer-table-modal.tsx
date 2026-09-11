'use client';

import { useEffect, useState } from 'react';
import { getOnDutyWaiters, transferTable } from '@/lib/shared/table-status';
import type { OnDutyWaiter, RestaurantTable } from '@/types/database';

export function TransferTableModal({
  table,
  restaurantId,
  currentMemberId,
  onClose,
  onTransferred,
}: {
  table: RestaurantTable;
  restaurantId: string;
  currentMemberId: string;
  onClose: () => void;
  onTransferred: (toMemberId: string, toName: string) => void;
}) {
  const [colleagues, setColleagues] = useState<OnDutyWaiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOnDutyWaiters(restaurantId).then(({ data, error: fetchError }) => {
      if (cancelled) return;
      setLoading(false);
      if (fetchError) {
        setError(fetchError);
        return;
      }
      setColleagues(data.filter((w) => w.member_id !== currentMemberId));
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, currentMemberId]);

  async function handleConfirm() {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    setError(null);

    const { error: transferError } = await transferTable(table.id, selectedId);
    setSubmitting(false);

    if (transferError) {
      setError(transferError);
      return;
    }
    const toName = colleagues.find((w) => w.member_id === selectedId)?.display_name ?? 'them';
    onTransferred(selectedId, toName);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-table-title"
    >
      <div className="card w-full max-w-sm p-5">
        <h2 id="transfer-table-title" className="font-display text-lg font-bold">
          Transfer Table {table.table_number}
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Hand this table — and any orders waiting on your approval — to another waiter on duty.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-text-muted">Loading colleagues on duty…</p>
          ) : colleagues.length === 0 ? (
            <p className="text-sm text-text-muted">No other waiters are currently on duty.</p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="field-input"
              aria-label="Select waiter to transfer to"
            >
              <option value="">Select a waiter…</option>
              {colleagues.map((w) => (
                <option key={w.member_id} value={w.member_id}>
                  {w.display_name ?? 'Unnamed waiter'}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedId || submitting}
            className="btn-primary flex-1 text-sm"
          >
            {submitting ? 'Transferring…' : 'Confirm Transfer'}
          </button>
          <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
