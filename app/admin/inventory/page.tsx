import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package, Settings } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { InventoryTable } from '@/components/admin/inventory/inventory-table';
import { getInventoryItems } from './actions';

export default async function InventoryPage() {
  const ctx = await requireRole(['owner', 'manager']);
  const membership = ctx.tenantMembership;
  if (!membership) redirect('/super-admin');
  const restaurant = membership.restaurant;

  if (!restaurant.inventory_tracking_enabled) {
    return <section className="card mx-auto max-w-xl space-y-4 p-6 text-center">
      <Package size={32} className="mx-auto text-amber" aria-hidden="true" />
      <h1 className="font-display text-2xl font-bold">Inventory tracking is off</h1>
      <p className="text-sm text-text-muted">Enable Raw Inventory Tracking in Settings to manage ingredients, record deliveries, and see low-stock alerts.</p>
      <Link href="/admin/settings" className="btn-primary gap-2"><Settings size={16} aria-hidden="true" />Open Settings</Link>
    </section>;
  }

  const result = await getInventoryItems(restaurant.id);
  return <div className="space-y-6">
    <div>
      <h1 className="font-display text-2xl font-bold">Inventory</h1>
      <p className="mt-1 text-sm text-text-muted">Raw ingredients and incoming stock · {restaurant.name}</p>
    </div>
    {result.error !== null ? <div role="alert" className="card space-y-3 p-5">
      <p className="text-sm text-danger">{result.error}</p>
      <Link href="/admin/inventory" className="btn-secondary">Try again</Link>
    </div> : <InventoryTable items={result.data} timeZone={restaurant.timezone || 'Asia/Kolkata'} />}
  </div>;
}
