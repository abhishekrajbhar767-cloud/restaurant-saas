import type { RestaurantStatus } from '@/types/database';

const STYLES: Record<RestaurantStatus, string> = {
  active: 'bg-success/10 text-success border-success/30',
  suspended: 'bg-danger/10 text-danger border-danger/30',
  archived: 'bg-text-muted/10 text-text-muted border-text-muted/30',
};

export function RestaurantStatusBadge({ status }: { status: RestaurantStatus }) {
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${STYLES[status]}`}>
      {status}
    </span>
  );
}
