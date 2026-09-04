'use client';

import { useState } from 'react';
import { BookmarkIcon, FlameIcon, FoodTypeMark, MinusIcon, PlusIcon, ShareIcon, ZapIcon } from '@/components/customer/icons';
import { QUICK_PREP_MINUTES } from '@/components/customer/filter-bar';
import type { MenuItem } from '@/types/database';

// Descriptions longer than this get clamped with an inline "…more" toggle.
// Character-based rather than measured so the collapsed/expanded state is
// deterministic across viewports and SSR.
const DESCRIPTION_CLAMP = 84;

// The schema has no spicy flag, so the badge is inferred from the copy the
// owner wrote. Deliberately conservative — a false "spicy" is worse than none.
const SPICY_PATTERN = /\b(spicy|chilli|chili|chilly|peri[- ]?peri|schezwan|szechuan|jalape[nñ]o|fiery|extra hot|ghost pepper|vindaloo|phaal)\b/i;

export function isSpicy(item: MenuItem): boolean {
  return SPICY_PATTERN.test(`${item.name} ${item.description ?? ''}`);
}

export function formatPrice(value: number): string {
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

export function ItemCard({
  item,
  quantityInCart,
  onAdd,
  onRemove,
  saved,
  onToggleSave,
  onShare,
}: {
  item: MenuItem;
  quantityInCart: number;
  onAdd: () => void;
  onRemove: () => void;
  saved: boolean;
  onToggleSave: () => void;
  onShare: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const description = item.description?.trim() ?? '';
  const needsClamp = description.length > DESCRIPTION_CLAMP;
  const spicy = isSpicy(item);
  const quick = item.prep_time > 0 && item.prep_time <= QUICK_PREP_MINUTES;

  return (
    <article
      className={`flex gap-4 py-5 ${!item.is_available ? 'opacity-60' : ''}`}
      aria-label={item.name}
    >
      {/* ---------- Left: content ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <FoodTypeMark foodType={item.food_type} size={16} />
          {spicy && (
            <span className="inline-flex items-center gap-0.5 rounded bg-nonveg/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-nonveg">
              <FlameIcon size={11} />
              Spicy
            </span>
          )}
          {quick && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-bright">
              <ZapIcon size={11} />
              {item.prep_time} min
            </span>
          )}
        </div>

        <h3 className="mt-2 font-display text-[17px] font-bold leading-snug text-white">{item.name}</h3>
        <p className="mt-1 text-[15px] font-semibold text-zinc-100">{formatPrice(item.price)}</p>

        {description && (
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            {needsClamp && !expanded ? `${description.slice(0, DESCRIPTION_CLAMP).trimEnd()}…` : description}
            {needsClamp && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  aria-expanded={expanded}
                  className="font-semibold text-zinc-200 hover:text-white"
                >
                  {expanded ? 'less' : 'more'}
                </button>
              </>
            )}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3">
          <IconButton onClick={onToggleSave} label={saved ? `Remove ${item.name} from saved` : `Save ${item.name}`} active={saved} pressed={saved}>
            <BookmarkIcon size={16} filled={saved} />
          </IconButton>
          <IconButton onClick={onShare} label={`Share ${item.name}`}>
            <ShareIcon size={16} />
          </IconButton>
        </div>
      </div>

      {/* ---------- Right: media + add ---------- */}
      <div className="flex w-[132px] shrink-0 flex-col items-center sm:w-[148px]">
        <div className="relative w-full">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- image URL may be any host; next/image would crash on unconfigured hostnames
            <img
              src={item.image_url}
              alt={item.name}
              width={148}
              height={148}
              loading="lazy"
              className={`aspect-square w-full rounded-2xl object-cover ring-1 ring-white/[0.06] ${!item.is_available ? 'grayscale' : ''}`}
            />
          ) : (
            <div
              className="flex aspect-square w-full items-center justify-center rounded-2xl bg-gradient-to-br from-surface-700 to-surface-800 ring-1 ring-white/[0.06]"
              aria-hidden
            >
              <span className="font-display text-3xl font-bold text-white/10">{item.name.charAt(0).toUpperCase()}</span>
            </div>
          )}

          <div className="absolute inset-x-0 -bottom-4 flex justify-center">
            {item.is_available ? (
              quantityInCart > 0 ? (
                <div
                  className="flex h-9 w-[104px] items-stretch overflow-hidden rounded-lg bg-brand font-display text-sm font-bold text-white shadow-lg shadow-black/40"
                  role="group"
                  aria-label={`${item.name} quantity`}
                >
                  <button type="button" onClick={onRemove} aria-label={`Remove one ${item.name}`} className="flex flex-1 items-center justify-center hover:bg-white/10">
                    <MinusIcon size={14} />
                  </button>
                  <span className="flex min-w-6 items-center justify-center tabular-nums" aria-live="polite">
                    {quantityInCart}
                  </span>
                  <button type="button" onClick={onAdd} aria-label={`Add one more ${item.name}`} className="flex flex-1 items-center justify-center hover:bg-white/10">
                    <PlusIcon size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onAdd}
                  className="relative h-9 w-[104px] rounded-lg border border-zinc-600/70 bg-surface-800 font-display text-sm font-bold tracking-wide text-brand-bright shadow-lg shadow-black/40 transition-colors hover:bg-surface-700 active:scale-[0.98]"
                >
                  ADD
                  <PlusIcon size={11} className="absolute right-1.5 top-1.5" />
                </button>
              )
            ) : (
              <span className="flex h-9 w-[104px] items-center justify-center rounded-lg border border-white/10 bg-surface-900 font-display text-xs font-semibold text-zinc-500">
                Sold out
              </span>
            )}
          </div>
        </div>

        {item.is_available && <span className="mt-6 text-[11px] leading-none text-zinc-500">customisable</span>}
      </div>
    </article>
  );
}

function IconButton({
  children,
  label,
  onClick,
  active = false,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
        active ? 'border-brand/60 bg-brand/15 text-brand-bright' : 'border-white/10 bg-surface-800 text-zinc-300 hover:bg-surface-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
