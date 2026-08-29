import { requireRole } from '@/lib/auth/session';
import { getRestaurantTables } from '@/lib/restaurant/queries';
import { TableManager } from '@/components/admin/table-manager';

export default async function TablesPage() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurant = ctx.tenantMembership!.restaurant;
  const tables = await getRestaurantTables(restaurant.id);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Tables</h1>
        <p className="text-sm text-text-muted">Each table gets its own QR code linking straight to your menu.</p>
      </div>

      <TableManager tables={tables} siteUrl={siteUrl} restaurantSlug={restaurant.slug} />
    </div>
  );
}
