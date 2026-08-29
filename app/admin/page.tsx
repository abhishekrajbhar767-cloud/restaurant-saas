import { requireRole } from '@/lib/auth/session';
import { StatCard } from '@/components/shared/stat-card';
import { getRestaurantStats } from '@/lib/restaurant/queries';

export default async function AdminDashboard() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurant = ctx.tenantMembership!.restaurant;
  const stats = await getRestaurantStats(restaurant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-text-muted">{restaurant.name}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Today's Orders" value={stats.today_orders} accent />
        <StatCard
          label="Today's Revenue"
          value={`\u20b9${Number(stats.today_revenue).toLocaleString('en-IN')}`}
          accent
        />
        <StatCard label="Active Tables" value={`${stats.active_table_count}/${stats.table_count}`} />
        <StatCard label="Pending Requests" value={stats.pending_service_requests} />
        <StatCard label="Preparing" value={stats.preparing_orders} />
        <StatCard label="Ready" value={stats.ready_orders} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Orders (all time)" value={stats.total_orders} />
        <StatCard label="Total Revenue (all time)" value={`\u20b9${Number(stats.total_revenue).toLocaleString('en-IN')}`} />
        <StatCard label="Staff" value={stats.staff_count} />
      </div>
    </div>
  );
}
