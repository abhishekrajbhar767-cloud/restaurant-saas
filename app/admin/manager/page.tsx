import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getMenuCategories, getMenuItems, getRestaurantTables } from '@/lib/restaurant/queries';
import { ManagerDashboard } from '@/components/admin/manager-dashboard';
import type { Order, ServiceRequest } from '@/types/database';

export default async function ManagerPage() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurant = ctx.tenantMembership!.restaurant;
  const supabase = createClient();

  // Only the live slice of orders/requests is needed — the map colours a table
  // by what is open on it right now, and the realtime channel keeps it current.
  const [tables, categories, items, { data: orders }, { data: requests }] = await Promise.all([
    getRestaurantTables(restaurant.id),
    getMenuCategories(restaurant.id),
    getMenuItems(restaurant.id),
    supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .in('status', ['placed', 'accepted', 'preparing', 'ready']),
    supabase
      .from('service_requests')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .in('status', ['pending', 'claimed']),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Manager</h1>
        <p className="text-sm text-text-muted">
          Your floor at a glance — table status and instant out-of-stock control, live across every device.
        </p>
      </div>

      <ManagerDashboard
        restaurantId={restaurant.id}
        initialTables={tables}
        initialCategories={categories}
        initialItems={items}
        initialOrders={(orders ?? []) as Order[]}
        initialRequests={(requests ?? []) as ServiceRequest[]}
      />
    </div>
  );
}
