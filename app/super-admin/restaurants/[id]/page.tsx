import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatCard } from '@/components/shared/stat-card';
import { RestaurantStatusBadge } from '@/components/shared/status-badge';
import { RestaurantStatusActions } from '@/components/super-admin/restaurant-status-actions';
import { ManageOwnerSection, RetryOwnerForm } from './owner-form';
import { getRestaurantById, getRestaurantStats, getRestaurantStaff, getRestaurantTables, getRecentOrders } from '@/lib/super-admin/queries';
import { ROLE_LABEL } from '@/lib/auth/roles';

export default async function RestaurantDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ownerError?: string };
}) {
  const restaurant = await getRestaurantById(params.id);
  if (!restaurant) notFound();

  const [stats, staff, tables, orders] = await Promise.all([
    getRestaurantStats(params.id),
    getRestaurantStaff(params.id),
    getRestaurantTables(params.id),
    getRecentOrders(params.id, 20),
  ]);

  const owner = staff.find((s) => s.role === 'owner' && s.is_active);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link href="/super-admin" className="text-xs text-text-muted hover:text-text underline underline-offset-2">
        ← Back to overview
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold">{restaurant.name}</h1>
            <RestaurantStatusBadge status={restaurant.status} />
          </div>
          <div className="text-sm text-text-muted font-mono">
            /menu/{restaurant.slug} · {restaurant.currency} · {restaurant.timezone}
          </div>
        </div>
        <RestaurantStatusActions restaurantId={restaurant.id} status={restaurant.status} />
      </div>

      {searchParams.ownerError && (
        <div className="card border-danger/40 p-5">
          <h2 className="font-display font-bold text-danger mb-1">Owner account creation failed</h2>
          <p className="text-sm text-text-muted mb-4">
            The restaurant was created, but the owner account couldn&apos;t be created — the email may already be registered.
            Enter a password and try again below.
          </p>
          <RetryOwnerForm restaurantId={restaurant.id} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Orders" value={stats.total_orders} />
        <StatCard label="Today's Orders" value={stats.today_orders} accent />
        <StatCard label="Total Revenue" value={`₹${Number(stats.total_revenue).toLocaleString('en-IN')}`} />
        <StatCard label="Today's Revenue" value={`₹${Number(stats.today_revenue).toLocaleString('en-IN')}`} accent />
        <StatCard label="Tables" value={`${stats.active_table_count}/${stats.table_count}`} />
        <StatCard label="Staff" value={stats.staff_count} />
        <StatCard label="Pending Requests" value={stats.pending_service_requests} />
      </div>

      <ManageOwnerSection restaurantId={restaurant.id} ownerName={owner?.display_name ?? null} ownerEmail={owner?.email ?? null} />

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-amber mb-3">Staff</h2>
          <div className="space-y-2">
            {staff.length === 0 && <p className="text-sm text-text-muted">No staff yet.</p>}
            {staff.map((s) => (
              <div key={s.member_id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{s.display_name ?? s.email}</div>
                  <div className="text-text-muted text-xs">{s.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-amber">{ROLE_LABEL[s.role]}</div>
                  <div className={`text-xs ${s.is_active ? 'text-success' : 'text-text-muted'}`}>{s.is_active ? 'Active' : 'Inactive'}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-amber mb-3">Tables</h2>
          <div className="grid grid-cols-5 gap-2">
            {tables.map((t) => (
              <div
                key={t.id}
                className={`rounded-sm border px-2 py-2 text-center font-mono text-sm ${
                  t.is_active ? 'border-line text-text' : 'border-line text-text-muted opacity-50'
                }`}
              >
                {t.table_number}
              </div>
            ))}
            {tables.length === 0 && <p className="text-sm text-text-muted col-span-5">No tables yet.</p>}
          </div>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-amber mb-3">Recent Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-muted border-b border-line">
                <th className="py-2 pr-4 font-medium">Order</th>
                <th className="py-2 pr-4 font-medium">Table</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium text-right">Total</th>
                <th className="py-2 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-text-muted">
                    No orders yet.
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 font-mono">#{o.order_number}</td>
                  <td className="py-2 pr-4">{o.table_number}</td>
                  <td className="py-2 pr-4 capitalize">{o.status}</td>
                  <td className="py-2 pr-4 text-right font-mono">₹{Number(o.subtotal).toLocaleString('en-IN')}</td>
                  <td className="py-2 text-text-muted">{new Date(o.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
