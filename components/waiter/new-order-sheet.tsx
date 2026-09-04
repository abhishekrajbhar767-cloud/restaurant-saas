'use client';

import { useMemo, useState, useTransition } from 'react';
import { createWaiterOrder } from '@/app/waiter/actions';
import type { MenuCategory, MenuItem, RestaurantTable } from '@/types/database';

type CartLine = { quantity: number; note: string };

export function NewOrderSheet({
  tables,
  categories,
  items,
  currency,
  onClose,
  onPlaced,
}: {
  tables: RestaurantTable[];
  categories: MenuCategory[];
  items: MenuItem[];
  currency: string;
  onClose: () => void;
  onPlaced: (message: string) => void;
}) {
  const [tableId, setTableId] = useState(tables[0]?.id ?? '');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryId && item.category_id !== categoryId) return false;
      return needle === '' || item.name.toLowerCase().includes(needle);
    });
  }, [items, categoryId, query]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([itemId, line]) => ({ item: items.find((i) => i.id === itemId), line }))
        .filter((entry): entry is { item: MenuItem; line: CartLine } => Boolean(entry.item)),
    [cart, items]
  );

  const total = cartLines.reduce((sum, { item, line }) => sum + item.price * line.quantity, 0);
  const itemCount = cartLines.reduce((sum, { line }) => sum + line.quantity, 0);

  function setQuantity(itemId: string, quantity: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (quantity <= 0) {
        delete next[itemId];
        return next;
      }
      next[itemId] = { quantity, note: prev[itemId]?.note ?? '' };
      return next;
    });
  }

  function setNote(itemId: string, note: string) {
    setCart((prev) => (prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], note } } : prev));
  }

  function handleSubmit() {
    setError(null);

    const table = tables.find((t) => t.id === tableId);
    if (!table) {
      setError('Pick a table first.');
      return;
    }

    startTransition(async () => {
      const result = await createWaiterOrder({
        tableId,
        lines: cartLines.map(({ item, line }) => ({
          menuItemId: item.id,
          quantity: line.quantity,
          note: line.note.trim() || undefined,
        })),
      });

      if (result.error) {
        setError(result.error);
        return;
      }
      onPlaced(
        result.orderNumber === null
          ? `Order sent to the kitchen for Table ${table.table_number}`
          : `Order #${result.orderNumber} sent to the kitchen for Table ${table.table_number}`
      );
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950" role="dialog" aria-modal="true" aria-label="New order">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="font-display text-lg font-bold">New Order</h2>
        <button type="button" onClick={onClose} disabled={isPending} className="btn-secondary px-3 py-1.5 text-sm">
          Cancel
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <label htmlFor="tableId" className="field-label">
            Table
          </label>
          {tables.length === 0 ? (
            <p className="text-sm text-text-muted">No active tables — add one under Tables first.</p>
          ) : (
            <select
              id="tableId"
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="field-input"
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  Table {table.table_number}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="itemSearch" className="sr-only">
            Search the menu
          </label>
          <input
            id="itemSearch"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the menu…"
            className="field-input"
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            <FilterChip active={categoryId === null} onClick={() => setCategoryId(null)}>
              All
            </FilterChip>
            {categories.map((category) => (
              <FilterChip
                key={category.id}
                active={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
              >
                {category.name}
              </FilterChip>
            ))}
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing on the menu matches that.</p>
        ) : (
          <ul className="space-y-2">
            {visibleItems.map((item) => {
              const line = cart[item.id];
              return (
                <li key={item.id} className="rounded border border-line bg-ink-800/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="font-mono text-xs text-text-muted">
                        {currency} {item.price.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <Stepper
                      quantity={line?.quantity ?? 0}
                      label={item.name}
                      onChange={(next) => setQuantity(item.id, next)}
                    />
                  </div>

                  {line && (
                    <input
                      type="text"
                      value={line.note}
                      onChange={(e) => setNote(item.id, e.target.value)}
                      maxLength={200}
                      placeholder="Note for the kitchen (optional)"
                      aria-label={`Kitchen note for ${item.name}`}
                      className="field-input mt-2 py-1.5 text-xs"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-line px-4 py-3">
        {error && (
          <p role="alert" className="mb-2 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-text-muted">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <span className="font-mono font-bold">
            {currency} {total.toLocaleString('en-IN')}
          </span>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || itemCount === 0 || tables.length === 0}
          className="btn-primary w-full py-3 text-base"
        >
          {isPending ? 'Sending…' : 'Send to kitchen'}
        </button>
      </footer>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active ? 'border-amber/50 bg-amber/15 text-amber' : 'border-line text-text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function Stepper({
  quantity,
  label,
  onChange,
}: {
  quantity: number;
  label: string;
  onChange: (quantity: number) => void;
}) {
  if (quantity === 0) {
    return (
      <button
        type="button"
        onClick={() => onChange(1)}
        aria-label={`Add ${label}`}
        className="btn-secondary shrink-0 px-3 py-1.5 text-sm"
      >
        Add
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1 rounded border border-line bg-ink-950/40 p-1">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={`Remove one ${label}`}
        className="h-8 w-8 rounded-sm font-display text-lg leading-none text-text-muted hover:bg-ink-800 hover:text-text"
      >
        −
      </button>
      <span className="w-6 text-center font-mono text-sm tabular-nums">{quantity}</span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        aria-label={`Add one ${label}`}
        className="h-8 w-8 rounded-sm font-display text-lg leading-none text-amber hover:bg-ink-800"
      >
        +
      </button>
    </div>
  );
}
