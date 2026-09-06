import type { SubscriptionStatus } from '@/types/database';

const STYLES: Record<SubscriptionStatus, string> = {
  active: 'bg-success/10 text-success border-success/30',
  trialing: 'bg-info/10 text-info border-info/30',
  expired: 'bg-danger/10 text-danger border-danger/30',
};

const LABELS: Record<SubscriptionStatus, string> = {
  active: 'Active',
  trialing: 'Trial',
  expired: 'Expired',
};

export function SubscriptionBadge({ status }: { status: SubscriptionStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wide bg-text-muted/10 text-text-muted border-text-muted/30">
        —
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
