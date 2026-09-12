'use client';

import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { addStock } from '@/app/admin/inventory/actions';
import { formatStock, MAX_STOCK } from '@/lib/inventory/validation';
import { InventoryModal } from './inventory-modal';
import type { InventoryItem } from '@/types/database';

export function AddStockModal({ item, onClose, onSaved }: {
  item: InventoryItem;
  onClose: () => void;
  onSaved: (item: InventoryItem, message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get('quantity'));
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await addStock(item.id, quantity, String(form.get('notes') ?? ''));
      if (result.error !== null) { setError(result.error); return; }
      onSaved(result.data, `Added ${formatStock(quantity)} ${item.unit} to ${item.name}.`);
    } catch {
      setError('Could not confirm the stock addition. Refresh and check the history before trying again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <InventoryModal title={`Add stock · ${item.name}`} onClose={onClose} busy={pending}>
      <p className="mb-4 text-sm text-text-muted">Current stock: {formatStock(item.current_stock)} {item.unit}</p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4">
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div>
              <label htmlFor="restock-quantity" className="field-label">Quantity Added</label>
              <input id="restock-quantity" name="quantity" type="number" inputMode="decimal" min="0.001" max={MAX_STOCK}
                step="0.001" required autoFocus placeholder="e.g. 10" className="field-input" aria-describedby="quantity-help" />
            </div>
            <div>
              <label htmlFor="restock-unit" className="field-label">Unit</label>
              <input id="restock-unit" value={item.unit} readOnly className="field-input text-text-muted" />
            </div>
          </div>
          <p id="quantity-help" className="text-xs text-text-muted">Enter the incoming quantity, using up to 3 decimal places.</p>
          <div>
            <label htmlFor="restock-notes" className="field-label">Notes / Vendor (optional)</label>
            <textarea id="restock-notes" name="notes" rows={3} maxLength={500} placeholder="Vendor name, delivery reference…" className="field-input" />
          </div>
        </fieldset>
        {error && <p role="alert" className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-line pt-4">
          <button type="button" onClick={onClose} disabled={pending} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={pending} className="btn-primary gap-2">
            <Plus size={16} aria-hidden="true" />{pending ? 'Adding…' : 'Add Stock'}
          </button>
        </div>
      </form>
    </InventoryModal>
  );
}
