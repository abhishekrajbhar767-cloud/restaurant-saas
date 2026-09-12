'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { getInventoryItems } from '@/app/admin/inventory/actions';
import { getMenuItemRecipe, saveMenuItemRecipe } from '@/app/admin/menu/recipe-actions';
import { InventoryModal } from '@/components/admin/inventory/inventory-modal';
import { MAX_RECIPE_QUANTITY, RecipeIngredientSchema, RecipeIngredientsSchema } from '@/lib/menu/recipe';
import type { InventoryItem, InventoryUnit, MenuItem } from '@/types/database';

type DraftIngredient = {
  inventory_item_id: string;
  name: string;
  unit: InventoryUnit;
  quantity: string;
};

export function RecipeMappingModal({ menuItem, restaurantId, onClose, onSaved }: {
  menuItem: MenuItem;
  restaurantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void Promise.all([getInventoryItems(restaurantId), getMenuItemRecipe(menuItem.id)])
      .then(([stock, recipe]) => {
        if (!active) return;
        if (stock.error !== null) { setLoadError(stock.error); return; }
        if (recipe.error !== null) { setLoadError(recipe.error); return; }
        setInventory(stock.data);
        setIngredients(recipe.data.map((line) => ({
          inventory_item_id: line.inventory_item_id,
          name: line.inventory_item.name,
          unit: line.inventory_item.unit,
          quantity: Number(line.quantity_required).toFixed(3),
        })));
      })
      .catch(() => { if (active) setLoadError('Could not load recipe ingredients. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [restaurantId, menuItem.id, attempt]);

  const available = inventory.filter((item) => !ingredients.some((line) => line.inventory_item_id === item.id));
  const selected = available.find((item) => item.id === selectedId);

  function addIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const parsed = RecipeIngredientSchema.safeParse({ inventory_item_id: selectedId, quantity_required: Number(quantity) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the ingredient quantity.'); return; }
    if (!selected) { setError('Select an ingredient that is not already in the recipe.'); return; }
    setIngredients((previous) => [...previous, {
      inventory_item_id: selected.id,
      name: selected.name,
      unit: selected.unit,
      quantity: parsed.data.quantity_required.toFixed(3),
    }]);
    setSelectedId('');
    setQuantity('');
  }

  async function save() {
    if (inFlight.current || loading || loadError) return;
    setError(null);
    if (selectedId || quantity.trim()) {
      setError('Click Add Ingredient to include the new row, or clear its fields before saving.');
      return;
    }
    const parsed = RecipeIngredientsSchema.safeParse(ingredients.map((line) => ({
      inventory_item_id: line.inventory_item_id,
      quantity_required: line.quantity.trim() === '' ? NaN : Number(line.quantity),
    })));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Each ingredient needs a positive quantity per serving.');
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const result = await saveMenuItemRecipe(menuItem.id, parsed.data);
      if (result.error !== null) { setError(result.error); return; }
      onSaved();
    } catch {
      setError('Could not save this recipe. Your edits are still here; please try again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <InventoryModal title={`Recipe / Ingredient Mapping: ${menuItem.name}`} onClose={onClose} busy={pending}>
      <p className="mb-4 text-sm text-text-muted">
        Quantities are per 1 dish serving, in each ingredient’s stock unit. Changes and removals apply when you save.
      </p>

      {loading ? (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />Loading ingredients…
        </p>
      ) : loadError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-danger">{loadError}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="btn-secondary">Try again</button>
        </div>
      ) : (
        <div className="space-y-5">
          <section aria-label="Mapped ingredients">
            {ingredients.length === 0 ? (
              <p className="rounded border border-dashed border-line px-4 py-5 text-sm text-text-muted">
                No ingredients mapped. Saving an empty list clears this dish’s recipe.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {ingredients.map((line) => (
                  <li key={line.inventory_item_id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">{line.name}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        max={MAX_RECIPE_QUANTITY}
                        step="0.001"
                        required
                        value={line.quantity}
                        disabled={pending}
                        onChange={(event) => {
                          const value = event.target.value;
                          setIngredients((previous) => previous.map((row) => row.inventory_item_id === line.inventory_item_id ? { ...row, quantity: value } : row));
                        }}
                        aria-label={`Quantity of ${line.name} per serving in ${line.unit}`}
                        className="field-input w-28 py-2 text-sm"
                      />
                      <span className="w-9 text-xs text-text-muted">{line.unit}</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setIngredients((previous) => previous.filter((row) => row.inventory_item_id !== line.inventory_item_id));
                        }}
                        aria-label={`Remove ${line.name} from recipe`}
                        className="rounded p-2 text-text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {inventory.length === 0 ? (
            <p className="text-sm text-text-muted">
              Create raw ingredients in <Link href="/admin/inventory" className="text-amber underline underline-offset-2">Inventory</Link> first, then return to map this dish.
            </p>
          ) : available.length === 0 ? (
            <p className="text-xs text-text-muted">All available ingredients are already in this recipe.</p>
          ) : (
            <form onSubmit={addIngredient} className="space-y-3 rounded border border-line bg-ink-800/40 p-4">
              <h3 className="font-display text-sm font-bold">Add an ingredient</h3>
              <fieldset disabled={pending} className="space-y-3">
                <div>
                  <label htmlFor="recipe-ingredient" className="field-label">Ingredient</label>
                  <select id="recipe-ingredient" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required className="field-input">
                    <option value="">Select ingredient</option>
                    {available.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="recipe-quantity" className="field-label">Quantity required per 1 serving</label>
                  <div className="flex items-center gap-3">
                    <input id="recipe-quantity" type="number" inputMode="decimal" min="0.001" max={MAX_RECIPE_QUANTITY}
                      step="0.001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="e.g. 0.250" className="field-input" aria-describedby="recipe-unit" />
                    <span id="recipe-unit" className="w-10 shrink-0 text-sm text-text-muted">{selected?.unit ?? '—'}</span>
                  </div>
                </div>
                <button type="submit" disabled={!selected || !quantity || pending} className="btn-secondary gap-2 text-sm">
                  <Plus size={16} aria-hidden="true" />Add Ingredient
                </button>
              </fieldset>
            </form>
          )}
          {error && <p role="alert" className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
        <button type="button" onClick={onClose} disabled={pending} className="btn-secondary">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={loading || !!loadError || pending} className="btn-primary gap-2">
          {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {pending ? 'Saving…' : 'Save Recipe'}
        </button>
      </div>
    </InventoryModal>
  );
}
