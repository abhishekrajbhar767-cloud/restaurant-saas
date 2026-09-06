import type { TrackingStatus } from '@/types/database';

const STYLES: Record<TrackingStatus, string> = {
  active: 'bg-success/10 text-success border-success/30',
  expiring_soon: 'bg-amber/10 text-amber border-amber/40',
  expired: 'bg-danger/10 text-danger border-danger/30',
};

const LABELS: Record<TrackingStatus, string> = {
  active: 'Active',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
};

export function SubscriptionBadge({ status }: { status: TrackingStatus | null }) {
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
