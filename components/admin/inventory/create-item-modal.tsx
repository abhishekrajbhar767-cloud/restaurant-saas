'use client';

import { useRef, useState } from 'react';
import { createInventoryItem } from '@/app/admin/inventory/actions';
import { CreateInventoryItemSchema, INVENTORY_UNITS, MAX_STOCK } from '@/lib/inventory/validation';
import { InventoryModal } from './inventory-modal';
import type { InventoryItem } from '@/types/database';

export function CreateItemModal({ onClose, onSaved }: {
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
    const parsed = CreateInventoryItemSchema.safeParse({
      name: form.get('name'), unit: form.get('unit'), min_alert_limit: Number(form.get('min_alert_limit')),
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the ingredient details.'); return; }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await createInventoryItem(parsed.data);
      if (result.error !== null) { setError(result.error); return; }
      onSaved(result.data, `${result.data.name} created. Use Add Stock to record your first delivery.`);
    } catch {
      setError('Could not confirm creation. Refresh the ingredient list before trying again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <InventoryModal title="New ingredient" onClose={onClose} busy={pending}>
      <p className="mb-4 text-sm text-text-muted">New ingredients start with zero stock. Record deliveries with Add Stock.</p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4">
          <div>
            <label htmlFor="ingredient-name" className="field-label">Name</label>
            <input id="ingredient-name" name="name" required maxLength={120} autoFocus placeholder="e.g. Basmati rice" className="field-input" />
          </div>
          <div>
            <label htmlFor="ingredient-unit" className="field-label">Unit</label>
            <select id="ingredient-unit" name="unit" defaultValue="kg" className="field-input">
              {INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ingredient-limit" className="field-label">Min Alert Limit</label>
            <input id="ingredient-limit" name="min_alert_limit" type="number" inputMode="decimal" min="0" max={MAX_STOCK}
              step="0.001" defaultValue="1" required className="field-input" aria-describedby="limit-help" />
            <p id="limit-help" className="mt-2 text-xs text-text-muted">Low Stock appears when stock reaches or falls below this quantity.</p>
          </div>
        </fieldset>
        {error && <p role="alert" className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-line pt-4">
          <button type="button" onClick={onClose} disabled={pending} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Creating…' : 'Create Ingredient'}</button>
        </div>
      </form>
    </InventoryModal>
  );
}
