'use client';

import Image from 'next/image';
import type { MenuItem } from '@/types/database';

// Color is never the only signal here — shape + a screen-reader label carry
// the same information, since color-only status indicators fail the
// accessibility bar the spec calls out (Section 32).
const FOOD_TYPE_STYLE: Record<MenuItem['food_type'], { className: string; label: string }> = {
  veg: { className: 'bg-success rounded-sm', label: 'Vegetarian' },
  vegan: { className: 'bg-success rounded-sm', label: 'Vegan' },
  egg: { className: 'bg-amber-dim rounded-full', label: 'Contains egg' },
  non_veg: { className: 'bg-danger', label: 'Non-vegetarian' }, // triangle via clip-path below
};

function FoodTypeIndicator({ foodType }: { foodType: MenuItem['food_type'] }) {
  const { className, label } = FOOD_TYPE_STYLE[foodType];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`h-2.5 w-2.5 shrink-0 border border-ink-950/30 ${className}`}
        style={foodType === 'non_veg' ? { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', border: 'none' } : undefined}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function ItemCard({
  item,
  quantityInCart,
  onAdd,
}: {
  item: MenuItem;
  quantityInCart: number;
  onAdd: () => void;
}) {
  return (
    <div className={`flex gap-3 py-4 border-b border-ink-950/10 last:border-0 ${!item.is_available ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <FoodTypeIndicator foodType={item.food_type} />
          <h3 className="font-display font-medium truncate">{item.name}</h3>
        </div>
        {item.description && <p className="text-sm text-text-onPaper/60 line-clamp-2 mb-2">{item.description}</p>}
        <div className="flex items-center gap-3 text-sm">
          <span className="font-mono font-medium">₹{Number(item.price).toLocaleString('en-IN')}</span>
          <span className="text-text-onPaper/50 text-xs">{item.prep_time} min</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 shrink-0 w-24">
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name} width={96} height={96} className="h-24 w-24 rounded object-cover" />
        ) : (
          <div className="h-24 w-24 rounded bg-ink-950/5" aria-hidden />
        )}
        {item.is_available ? (
          <button
            onClick={onAdd}
            className="w-full -mt-4 rounded bg-ink-950 text-paper text-xs font-display font-medium py-1.5 shadow-md hover:bg-ink-800 transition-colors"
          >
            {quantityInCart > 0 ? `Add (${quantityInCart})` : 'Add'}
          </button>
        ) : (
          <span className="w-full -mt-4 rounded bg-ink-950/10 text-text-onPaper/50 text-xs font-display text-center py-1.5">Sold out</span>
        )}
      </div>
    </div>
  );
}
