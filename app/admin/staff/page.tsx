import { requireRole } from '@/lib/auth/session';
import { getRestaurantStaff } from '@/lib/restaurant/queries';
import { StaffManager } from '@/components/admin/staff-manager';

export default async function StaffPage() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurant = ctx.tenantMembership!.restaurant;
  const staff = await getRestaurantStaff(restaurant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Staff</h1>
        <p className="text-sm text-text-muted">Invite kitchen and waiter accounts, and see who&apos;s currently free.</p>
      </div>

      <StaffManager staff={staff} actingRole={ctx.tenantMembership!.role} />
    </div>
  );
}
