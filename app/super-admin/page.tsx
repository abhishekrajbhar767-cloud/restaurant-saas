import Link from 'next/link';
import { StatCard } from '@/components/shared/stat-card';
import { RestaurantsTable } from '@/components/super-admin/restaurants-table';
import { getPlatformStats, getRestaurantOverview } from '@/lib/super-admin/queries';
import { billingStats } from '@/lib/super-admin/subscription';

export default async function SuperAdminDashboard() {
  const [stats, restaurants] = await Promise.all([getPlatformStats(), getRestaurantOverview()]);
  const billing = billingStats(restaurants);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Platform Overview</h1>
          <p className="text-sm text-text-muted">Track trials and subscriptions across every restaurant.</p>
        </div>
        <Link href="/super-admin/restaurants/new" className="btn-primary">
          + Create Restaurant
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Restaurants" value={stats.total_restaurants} />
        <StatCard label="Active (7+ days)" value={billing.active} accent />
        <StatCard label="Expiring in 7 days" value={billing.expiringSoon} />
        <StatCard label="Expired" value={billing.expired} />
      </div>

      <RestaurantsTable restaurants={restaurants} />
    </div>
  );
}
