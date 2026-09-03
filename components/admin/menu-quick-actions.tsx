'use client';

import { useMemo, useState } from 'react';
import type { MenuCategory, MenuItem } from '@/types/database';

type Filter = 'all' | 'available' | 'unavailable';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'On' },
  { value: 'unavailable', label: "86'd" },
];

export function MenuQuickActions({
  categories,
  items,
  pendingIds,
  onToggle,
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  pendingIds: ReadonlySet<string>;
  onToggle: (itemId: string, isAvailable: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [filter, setFilter] = useState<Filter>('all');

  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const unavailableCount = items.filter((item) => !item.is_available).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryId !== 'all' && item.category_id !== categoryId) return false;
      if (filter === 'available' && !item.is_available) return false;
      if (filter === 'unavailable' && item.is_available) return false;
      return needle === '' || item.name.toLowerCase().includes(needle);
    });
  }, [items, query, categoryId, filter]);

  return (
    <section className="card flex flex-col p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="font-display text-lg font-bold">Menu Quick Actions</h2>
          <p className="text-xs text-text-muted">Flip an item off and it disappears from every customer&apos;s menu instantly.</p>
        </div>
        <span className={`text-xs font-medium ${unavailableCount > 0 ? 'text-danger' : 'text-text-muted'}`}>
          {unavailableCount} 86&apos;d
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            aria-label="Search menu items"
            className="field-input sm:flex-1"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Filter by category"
            className="field-input sm:w-44"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded border border-line bg-ink-950/40 p-1">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={`rounded-sm py-2 text-xs font-display uppercase tracking-wide transition-colors ${
                filter === option.value ? 'bg-ink-800 text-amber' : 'text-text-muted hover:text-text'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 max-h-[520px] divide-y divide-line overflow-y-auto">
        {visible.map((item) => (
          <ItemToggleRow
            key={item.id}
            item={item}
            categoryName={categoryNames.get(item.category_id) ?? ''}
            isPending={pendingIds.has(item.id)}
            onToggle={onToggle}
          />
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="mt-4 text-sm text-text-muted">
          {items.length === 0 ? 'No menu items yet — add some under Menu.' : 'Nothing matches those filters.'}
        </p>
      )}
    </section>
  );
}

function ItemToggleRow({
  item,
  categoryName,
  isPending,
  onToggle,
}: {
  item: MenuItem;
  categoryName: string;
  isPending: boolean;
  onToggle: (itemId: string, isAvailable: boolean) => void;
}) {
  return (
    <li className={`flex items-center gap-3 py-2.5 ${isPending ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-medium ${item.is_available ? '' : 'text-text-muted line-through'}`}>{item.name}</div>
        <div className="truncate text-[11px] text-text-muted">
          {categoryName}
          {categoryName && ' · '}
          <span className="font-mono">₹{Number(item.price).toLocaleString('en-IN')}</span>
        </div>
      </div>

      <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${item.is_available ? 'text-success' : 'text-danger'}`}>
        {item.is_available ? 'On' : "86'd"}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={item.is_available}
        aria-label={`${item.name} available`}
        disabled={isPending}
        onClick={() => onToggle(item.id, !item.is_available)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:pointer-events-none ${
          item.is_available ? 'border-success/60 bg-success/70' : 'border-line bg-ink-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-paper transition-transform ${
            item.is_available ? 'translate-x-6' : 'translate-x-1'
          }`}
          aria-hidden
        />
      </button>
    </li>
  );
}
