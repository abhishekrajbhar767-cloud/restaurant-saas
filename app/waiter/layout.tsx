import { requireRole } from '@/lib/auth/session';
import { StaffTopbar } from '@/components/shared/staff-topbar';
import { SuspendedBanner } from '@/components/shared/suspended-banner';

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

  return (
    <div className="min-h-screen">
      <StaffTopbar area="Waiter" restaurantName={restaurant.name} />
      {restaurant.status === 'suspended' && <SuspendedBanner />}
      <main className="p-4">{children}</main>
    </div>
  );
}
