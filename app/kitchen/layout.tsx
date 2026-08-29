import { requireRole } from '@/lib/auth/session';
import { StaffTopbar } from '@/components/shared/staff-topbar';
import { SuspendedBanner } from '@/components/shared/suspended-banner';

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole(['kitchen', 'manager', 'owner']);
  const restaurant = ctx.tenantMembership?.restaurant;

  if (!restaurant) {
    return (
      <div className="min-h-screen">
        <StaffTopbar area="Kitchen" />
        <main className="p-6 text-sm text-text-muted">
          Pick a restaurant from the Super Admin dashboard to view its kitchen display in Support Mode.
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <StaffTopbar area="Kitchen Display" restaurantName={restaurant.name} />
      {restaurant.status === 'suspended' && <SuspendedBanner />}
      <main className="p-4">{children}</main>
    </div>
  );
}
