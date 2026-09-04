import { formatMoney } from '@/lib/manager/totals';
import type { EodSummary } from '@/types/database';

export function EodSummaryCards({ summary }: { summary: EodSummary }) {
  const hasWriteOffs = summary.voided_order_count > 0 || summary.voided_item_count > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Net revenue" value={formatMoney(summary.net_revenue)} accent />
        <Metric label="Orders" value={String(summary.order_count)} />
        <Metric
          label="Average order"
          value={summary.average_order_value === null ? '—' : formatMoney(summary.average_order_value)}
        />
        <Metric label="Items sold" value={String(summary.items_sold)} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric label="Gross before discounts" value={formatMoney(summary.gross_revenue)} muted />
        <Metric
          label="Discounts given"
          value={summary.discount_total > 0 ? `− ${formatMoney(summary.discount_total)}` : formatMoney(0)}
          tone={summary.discount_total > 0 ? 'text-amber' : undefined}
          muted
        />
        <Metric
          label="Voided"
          value={hasWriteOffs ? `${formatMoney(summary.voided_value)} · ${summary.voided_item_count} items` : 'None'}
          tone={hasWriteOffs ? 'text-danger' : undefined}
          muted
        />
      </div>

      {summary.voided_order_count > 0 && (
        <p className="text-xs text-text-muted">
          {summary.voided_order_count} whole {summary.voided_order_count === 1 ? 'order was' : 'orders were'} voided and
          are excluded from every figure above.
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  muted,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
  tone?: string;
}) {
  return (
    <div className="card p-4">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className={`font-display font-bold ${muted ? 'text-lg' : 'text-2xl'} ${
          tone ?? (accent ? 'text-amber' : 'text-text')
        }`}
      >
        {value}
      </div>
    </div>
  );
}
