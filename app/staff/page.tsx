import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getRestaurantById } from '@/lib/restaurant/queries';
import { ShiftClock } from '@/components/staff/shift-clock';
import { ROLE_LABEL } from '@/lib/auth/roles';
import type { StaffShift } from '@/types/database';

export default async function StaffShiftPage() {
  const ctx = await requireRole(['owner', 'manager', 'kitchen', 'waiter']);
  const membership = ctx.tenantMembership!;
  const memberId = membership.id;

  // The geofence may have been changed since login, so read the restaurant
  // fresh rather than using the membership snapshot.
  const restaurant = (await getRestaurantById(membership.restaurant.id)) ?? membership.restaurant;

  const supabase = createClient();
  const [{ data: open }, { data: recent }] = await Promise.all([
    supabase.from('staff_shifts').select('*').eq('staff_id', memberId).is('clock_out_time', null).maybeSingle(),
    supabase
      .from('staff_shifts')
      .select('*')
      .eq('staff_id', memberId)
      .not('clock_out_time', 'is', null)
      .order('clock_in_time', { ascending: false })
      .limit(5),
  ]);

  return (
    <ShiftClock
      restaurant={restaurant}
      openShift={(open as StaffShift | null) ?? null}
      recentShifts={(recent ?? []) as StaffShift[]}
      displayName={membership.display_name ?? ROLE_LABEL[membership.role]}
    />
  );
}
