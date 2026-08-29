import Link from 'next/link';
import { StatCard } from '@/components/shared/stat-card';
import { RestaurantsTable } from '@/components/super-admin/restaurants-table';
import { getPlatformStats, getRestaurantOverview } from '@/lib/super-admin/queries';

export default async function SuperAdminDashboard() {
  const [stats, restaurants] = await Promise.all([getPlatformStats(), getRestaurantOverview()]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Platform Overview</h1>
          <p className="text-sm text-text-muted">One deployment, every restaurant.</p>
        </div>
        <Link href="/super-admin/restaurants/new" className="btn-primary">
          + Create Restaurant
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Restaurants" value={stats.total_restaurants} />
        <StatCard label="Active" value={stats.active_restaurants} accent />
        <StatCard label="Suspended" value={stats.suspended_restaurants} />
        <StatCard label="Total Orders" value={stats.total_orders} />
        <StatCard label="Today's Orders" value={stats.today_orders} accent />
        <StatCard label="Total Revenue" value={`\u20b9${Number(stats.total_revenue).toLocaleString('en-IN')}`} />
        <StatCard label="Active Staff" value={stats.active_staff} />
        <StatCard label="Active Tables" value={stats.active_tables} />
      </div>

      <RestaurantsTable restaurants={restaurants} />
    </div>
  );
}
