import { requireRole } from '@/lib/auth/session';
import { getMenuCategories, getMenuItems } from '@/lib/restaurant/queries';
import { MenuManager } from '@/components/admin/menu-manager';

export default async function MenuPage() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurant = ctx.tenantMembership!.restaurant;

  const [categories, items] = await Promise.all([getMenuCategories(restaurant.id), getMenuItems(restaurant.id)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Menu</h1>
        <p className="text-sm text-text-muted">Categories, items, prices, and photos — changes go live immediately.</p>
      </div>

      <MenuManager categories={categories} items={items} />
    </div>
  );
}
