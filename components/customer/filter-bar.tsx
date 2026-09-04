'use client';

import { useState } from 'react';
import { CheckIcon, ChevronDownIcon, FoodTypeMark, SlidersIcon, ZapIcon } from '@/components/customer/icons';
import type { FoodType } from '@/types/database';

export type MenuSort = 'default' | 'price_asc' | 'price_desc';

export type MenuFilters = {
  /** Empty set = show every food type. */
  foodTypes: Set<FoodType>;
  /** Items that take ≤ QUICK_PREP_MINUTES to prepare. */
  quickOnly: boolean;
  hideUnavailable: boolean;
  sort: MenuSort;
};

export const QUICK_PREP_MINUTES = 15;

export const DEFAULT_FILTERS: MenuFilters = {
  foodTypes: new Set(),
  quickOnly: false,
  hideUnavailable: false,
  sort: 'default',
};

export function activeFilterCount(f: MenuFilters): number {
  return f.foodTypes.size + (f.quickOnly ? 1 : 0) + (f.hideUnavailable ? 1 : 0) + (f.sort !== 'default' ? 1 : 0);
}

const FOOD_TYPE_PILLS: { type: FoodType; label: string }[] = [
  { type: 'veg', label: 'Veg' },
  { type: 'egg', label: 'Egg' },
  { type: 'non_veg', label: 'Non-veg' },
  { type: 'vegan', label: 'Vegan' },
];

const SORT_OPTIONS: { value: MenuSort; label: string }[] = [
  { value: 'default', label: 'Relevance' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export function FilterBar({
  filters,
  onChange,
  availableFoodTypes,
}: {
  filters: MenuFilters;
  onChange: (next: MenuFilters) => void;
  /** Food types that actually appear on this menu — pills for absent types are hidden. */
  availableFoodTypes: Set<FoodType>;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const count = activeFilterCount(filters);

  function toggleFoodType(type: FoodType) {
    const next = new Set(filters.foodTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange({ ...filters, foodTypes: next });
  }

  return (
    <div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Menu filters">
        <Pill
          active={panelOpen || filters.sort !== 'default' || filters.hideUnavailable}
          onClick={() => setPanelOpen((o) => !o)}
          aria-expanded={panelOpen}
          aria-controls="menu-filter-panel"
        >
          <SlidersIcon size={15} />
          <span>Filters</span>
          {count > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white">
              {count}
            </span>
          )}
          <ChevronDownIcon size={14} className={`transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
        </Pill>

        {FOOD_TYPE_PILLS.filter((p) => availableFoodTypes.has(p.type)).map((p) => (
          <Pill key={p.type} active={filters.foodTypes.has(p.type)} onClick={() => toggleFoodType(p.type)} aria-pressed={filters.foodTypes.has(p.type)}>
            <FoodTypeMark foodType={p.type} size={15} />
            <span>{p.label}</span>
          </Pill>
        ))}

        <Pill active={filters.quickOnly} onClick={() => onChange({ ...filters, quickOnly: !filters.quickOnly })} aria-pressed={filters.quickOnly}>
          <ZapIcon size={15} className="text-amber-bright" />
          <span>Quick bites</span>
        </Pill>

        {count > 0 && (
          <button
            type="button"
            onClick={() => {
              onChange(DEFAULT_FILTERS);
              setPanelOpen(false);
            }}
            className="shrink-0 px-2 text-[13px] font-medium text-brand-bright hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {panelOpen && (
        <div id="menu-filter-panel" className="mt-3 rounded-xl border border-white/[0.06] bg-surface-800 p-3.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Sort by</p>
          <div className="flex flex-wrap gap-2">
            {SORT_OPTIONS.map((opt) => {
              const active = filters.sort === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...filters, sort: opt.value })}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
                    active ? 'border-brand/60 bg-brand/15 text-white' : 'border-white/10 text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  {active && <CheckIcon size={13} className="text-brand-bright" />}
                  {opt.label}
                </button>
              );
            })}
          </div>

          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 text-sm text-zinc-200">
            <span>Hide sold-out items</span>
            <input
              type="checkbox"
              checked={filters.hideUnavailable}
              onChange={(e) => onChange({ ...filters, hideUnavailable: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-600 bg-surface-700 accent-brand"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Pill({
  active,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors ${
        active ? 'border-zinc-300/70 bg-surface-700 text-white' : 'border-white/10 bg-surface-800 text-zinc-200 hover:bg-surface-700'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
