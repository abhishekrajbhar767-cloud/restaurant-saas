import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { KitchenBoard } from '@/components/kitchen/kitchen-board';
import type { OrderWithItems } from '@/types/database';

export default async function KitchenPage() {
  const ctx = await requireRole(['kitchen', 'manager', 'owner']);
  const restaurant = ctx.tenantMembership!.restaurant;
  const supabase = createClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(*), tables(table_number)')
    .eq('restaurant_id', restaurant.id)
    .in('status', ['placed', 'accepted', 'preparing', 'ready'])
    .order('created_at', { ascending: true });

  const initialOrders: OrderWithItems[] = (orders ?? []).map((o: any) => ({
    ...o,
    items: o.order_items ?? [],
    table_number: o.tables?.table_number ?? '\u2014',
  }));

  return <KitchenBoard restaurantId={restaurant.id} initialOrders={initialOrders} />;
}
