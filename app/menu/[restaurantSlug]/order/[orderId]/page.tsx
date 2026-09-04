import { createClient } from '@/lib/supabase/server';
import { OrderTracker } from '@/components/customer/order-tracker';
import type { TableStatus } from '@/types/database';

export default async function OrderTrackingPage({
  params,
  searchParams,
}: {
  params: { restaurantSlug: string; orderId: string };
  searchParams: { table?: string };
}) {
  const supabase = createClient();

  const { data: order, error } = await supabase.from('orders').select('*').eq('id', params.orderId).maybeSingle();

  if (error || !order) {
    return (
      <div className="min-h-screen bg-paper text-text-onPaper flex items-center justify-center px-6">
        <p className="text-sm text-text-onPaper/70">Order not found.</p>
      </div>
    );
  }

  const [{ data: orderItems }, { data: restaurant }, { data: table }, { data: rating }] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', order.id),
    supabase
      .from('restaurants')
      .select('name, currency, google_review_url')
      .eq('id', order.restaurant_id)
      .maybeSingle()
      .returns<{ name: string; currency: string; google_review_url: string | null }>(),
    supabase
      .from('tables')
      .select('id, table_number, status')
      .eq('id', order.table_id)
      .maybeSingle()
      .returns<{ id: string; table_number: string; status: TableStatus }>(),
    // customer_ratings has no anon SELECT policy, so this reads back through
    // the order-scoped RPC instead.
    supabase.rpc('get_customer_rating', { p_order_id: order.id }),
  ]);

  return (
    <OrderTracker
      initialOrder={order}
      orderItems={orderItems ?? []}
      restaurantName={restaurant?.name ?? ''}
      currency={restaurant?.currency ?? 'INR'}
      tableNumber={table?.table_number ?? ''}
      tableId={table?.id ?? order.table_id}
      restaurantSlug={params.restaurantSlug}
      tableQrToken={searchParams.table}
      initialTableStatus={table?.status ?? 'empty'}
      initialRating={rating ?? null}
      googleReviewUrl={restaurant?.google_review_url ?? null}
    />
  );
}