import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getMenuCategories, getMenuItems, getRestaurantTables } from '@/lib/restaurant/queries';
import { WaiterApp } from '@/components/waiter/waiter-app';
import type { Order, OrderItem, OrderWithItems, ServiceRequestWithTable } from '@/types/database';

export default async function WaiterPage() {
  const ctx = await requireRole(['waiter', 'manager', 'owner']);
  const restaurant = ctx.tenantMembership!.restaurant;
  const memberId = ctx.tenantMembership!.id;
  const supabase = createClient();

  const [{ data: requests }, { data: myStatus }, { data: pendingApprovalRows }, tables, categories, menuItems] = await Promise.all([
    supabase
      .from('service_requests')
      .select('*, tables(table_number)')
      .eq('restaurant_id', restaurant.id)
      .in('status', ['pending', 'claimed'])
      .order('created_at', { ascending: true }),
    supabase.from('waiter_status').select('*').eq('member_id', memberId).maybeSingle(),
    supabase
      .from('orders')
      .select('*, order_items(*), tables(table_number, assigned_waiter_id)')
      .eq('restaurant_id', restaurant.id)
      .eq('status', 'pending_waiter_approval')
      .order('created_at', { ascending: true }),
    getRestaurantTables(restaurant.id),
    getMenuCategories(restaurant.id),
    getMenuItems(restaurant.id),
  ]);

  const initialRequests: ServiceRequestWithTable[] = (requests ?? []).map((r: any) => ({
    ...r,
    table_number: r.tables?.table_number ?? '—',
  }));

  // Held orders are exclusive to the waiter assigned to their table — an
  // unclaimed table's orders are up for grabs, but one claimed by someone
  // else is their queue, not this waiter's.
  const initialPendingApprovals: OrderWithItems[] = ((pendingApprovalRows ?? []) as unknown as (Order & {
    order_items: OrderItem[] | null;
    tables: { table_number: string; assigned_waiter_id: string | null } | null;
  })[])
    .filter((o) => !o.tables?.assigned_waiter_id || o.tables.assigned_waiter_id === memberId)
    .map(({ order_items, tables: t, ...rest }) => ({ ...rest, items: order_items ?? [], table_number: t?.table_number ?? '—' }));

  return (
    <WaiterApp
      restaurantId={restaurant.id}
      memberId={memberId}
      initialAvailability={myStatus?.availability ?? 'offline'}
      initialRequests={initialRequests}
      // Inactive tables are dropped client-side instead, so the table board
      // can react to one being retired mid-shift over realtime.
      initialTables={tables}
      initialPendingApprovals={initialPendingApprovals}
      // 86'd items are filtered out here — create_order rejects them anyway,
      // and a waiter should not be able to tap one at the table.
      categories={categories.filter((c) => c.is_active)}
      menuItems={menuItems.filter((i) => i.is_available)}
      currency={restaurant.currency}
      askName={restaurant.enable_customer_name}
      askMobile={restaurant.enable_customer_mobile}
    />
  );
}
