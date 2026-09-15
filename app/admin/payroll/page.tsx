import { requireRole } from '@/lib/auth/session';
import { getRestaurantById, getRestaurantStaff } from '@/lib/restaurant/queries';
import { PayrollDashboard } from '@/components/admin/payroll-dashboard';

export default async function PayrollPage() {
  const ctx = await requireRole(['owner', 'manager']);
  const membership = ctx.tenantMembership!;
  const restaurant = (await getRestaurantById(membership.restaurant.id)) ?? membership.restaurant;
  const timeZone = restaurant.timezone || 'Asia/Kolkata';
  const staff = await getRestaurantStaff(restaurant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Payroll &amp; Attendance</h1>
        <p className="text-sm text-text-muted">
          Clock-ins are geofenced, stamped by the server clock, and refused outright from a mocked GPS — so what you
          are paying on here is what the floor actually worked.
        </p>
      </div>

      <PayrollDashboard
        restaurantName={restaurant.name}
        currency={restaurant.currency}
        timeZone={timeZone}
        today={todayIn(timeZone)}
        staff={staff}
      />
    </div>
  );
}

function todayIn(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is also the value a date input wants.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
