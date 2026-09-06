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
          <p className="text-sm text-text-muted">Restaurants, trials, and subscription windows.</p>
        </div>
        <Link href="/super-admin/restaurants/new" className="btn-primary">
          + Create Restaurant
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Restaurants" value={stats.total_restaurants} />
        <StatCard label="Active" value={stats.active_restaurants} accent />
        <StatCard label="On Trial" value={billing.trialing} />
        <StatCard label="Expiring in 3 days" value={billing.expiringSoon} />
        <StatCard label="Expired plans" value={billing.expired} />
        <StatCard label="Today's Orders" value={stats.today_orders} accent />
        <StatCard label="Total Revenue" value={`\u20b9${Number(stats.total_revenue).toLocaleString('en-IN')}`} />
        <StatCard label="Active Staff" value={stats.active_staff} />
      </div>

      <RestaurantsTable restaurants={restaurants} />
    </div>
  );
}
