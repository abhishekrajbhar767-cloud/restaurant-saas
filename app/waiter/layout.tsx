import { requireRole } from '@/lib/auth/session';
import { getOpenShift } from '@/lib/restaurant/queries';
import { StaffTopbar } from '@/components/shared/staff-topbar';
import { SuspendedBanner } from '@/components/shared/suspended-banner';
import { ShiftRequired } from '@/components/shared/shift-required';

export default async function WaiterLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole(['waiter', 'manager', 'owner']);
  const restaurant = ctx.tenantMembership?.restaurant;

  if (!restaurant) {
    return (
      <div className="min-h-screen">
        <StaffTopbar area="Waiter" />
        <main className="p-6 text-sm text-text-muted">
          Pick a restaurant from the Super Admin dashboard to view its waiter app in Support Mode.
        </main>
      </div>
    );
  }

  // Only the waiter role itself is shift-gated — owners/managers oversee
  // shifts from /admin and may need to open this view without clocking in.
  const isFrontlineWaiter = ctx.tenantMembership?.role === 'waiter';
  const openShift = isFrontlineWaiter ? await getOpenShift(ctx.tenantMembership!.id) : null;

  return (
    <div className="min-h-screen">
      <StaffTopbar area="Waiter" restaurantName={restaurant.name} />
      {restaurant.status === 'suspended' && <SuspendedBanner />}
      <main className="p-4">{isFrontlineWaiter && !openShift ? <ShiftRequired area="the Waiter app" /> : children}</main>
    </div>
  );
}
