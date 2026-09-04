import { requireRole } from '@/lib/auth/session';
import { StaffTopbar } from '@/components/shared/staff-topbar';
import { SuspendedBanner } from '@/components/shared/suspended-banner';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole(['owner', 'manager', 'kitchen', 'waiter']);
  const restaurant = ctx.tenantMembership?.restaurant;

  if (!restaurant) {
    return (
      <div className="min-h-screen">
        <StaffTopbar area="Shift" />
        <main className="p-6 text-sm text-text-muted">
          Super Admin accounts have no shift of their own — pick a restaurant from the Super Admin dashboard.
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <StaffTopbar area="Shift" restaurantName={restaurant.name} />
      {restaurant.status === 'suspended' && <SuspendedBanner />}
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
