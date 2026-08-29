import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { WaiterApp } from '@/components/waiter/waiter-app';
import type { ServiceRequestWithTable } from '@/types/database';

export default async function WaiterPage() {
  const ctx = await requireRole(['waiter', 'manager', 'owner']);
  const restaurant = ctx.tenantMembership!.restaurant;
  const memberId = ctx.tenantMembership!.id;
  const supabase = createClient();

  const [{ data: requests }, { data: myStatus }] = await Promise.all([
    supabase
      .from('service_requests')
      .select('*, tables(table_number)')
      .eq('restaurant_id', restaurant.id)
      .in('status', ['pending', 'claimed'])
      .order('created_at', { ascending: true }),
    supabase.from('waiter_status').select('*').eq('member_id', memberId).maybeSingle(),
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
    />
  );
}
