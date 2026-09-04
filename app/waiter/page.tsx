import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getMenuCategories, getMenuItems, getRestaurantTables } from '@/lib/restaurant/queries';
import { WaiterApp } from '@/components/waiter/waiter-app';
import type { ServiceRequestWithTable } from '@/types/database';

export default async function WaiterPage() {
  const ctx = await requireRole(['waiter', 'manager', 'owner']);
  const restaurant = ctx.tenantMembership!.restaurant;
  const memberId = ctx.tenantMembership!.id;
  const supabase = createClient();

  const [{ data: requests }, { data: myStatus }, tables, categories, menuItems] = await Promise.all([
    supabase
      .from('service_requests')
      .select('*, tables(table_number)')
      .eq('restaurant_id', restaurant.id)
      .in('status', ['pending', 'claimed'])
      .order('created_at', { ascending: true }),
    supabase.from('waiter_status').select('*').eq('member_id', memberId).maybeSingle(),
    getRestaurantTables(restaurant.id),
    getMenuCategories(restaurant.id),
    getMenuItems(restaurant.id),
  ]);

  const initialRequests: ServiceRequestWithTable[] = (requests ?? []).map((r: any) => ({
    ...r,
    table_number: r.tables?.table_number ?? '\u2014',
  }));

  return (
    <WaiterApp
      restaurantId={restaurant.id}
      memberId={memberId}
      initialAvailability={myStatus?.availability ?? 'offline'}
      initialRequests={initialRequests}
      // 86'd items are filtered out here too — create_order rejects them
      // anyway, and a waiter should not be able to tap one at the table.
      tables={tables.filter((t) => t.is_active)}
      categories={categories.filter((c) => c.is_active)}
      menuItems={menuItems.filter((i) => i.is_available)}
      currency={restaurant.currency}
      askName={restaurant.enable_customer_name}
      askMobile={restaurant.enable_customer_mobile}
    />
  );
}
