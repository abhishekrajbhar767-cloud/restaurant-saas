import { formatMoney } from '@/lib/manager/totals';
import type { TopSellingItem } from '@/types/database';

export function TopSellingItems({ items }: { items: TopSellingItem[] }) {
  const busiest = items[0]?.quantity_sold ?? 0;

  return (
    <section className="card p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Top Selling Items</h2>
        <p className="text-xs text-text-muted">By volume sold. Voided lines are excluded.</p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Nothing sold on this day.</p>
      ) : (
        <ol className="mt-4 space-y-2.5">
          {items.map((item, index) => (
            <li key={item.item_name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">
                  <span className="mr-2 font-mono text-xs text-text-muted">{index + 1}</span>
                  {item.item_name}
                </span>
                <span className="shrink-0 font-mono text-sm">
                  {item.quantity_sold}
                  <span className="ml-1 text-xs text-text-muted">sold</span>
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2">
                {/* Bar is relative to the best seller, so the gap between #1 and the rest is readable at a glance. */}
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-amber"
                    style={{ width: `${busiest > 0 ? Math.max((item.quantity_sold / busiest) * 100, 4) : 0}%` }}
                  />
                </div>
                <span className="shrink-0 font-mono text-[11px] text-text-muted">{formatMoney(item.net_revenue)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
