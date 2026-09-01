import { requireRole } from '@/lib/auth/session';
import { StaffTopbar } from '@/components/shared/staff-topbar';
import { SuspendedBanner } from '@/components/shared/suspended-banner';
import { AdminNav } from '@/components/admin/admin-nav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurant = ctx.tenantMembership?.restaurant;

  if (!restaurant) {
    // Reached by a Super Admin with no tenant membership of their own — real
    // access here is meant to go through Support Mode (section 27), which
    // picks a specific restaurant to inspect. Landing bare, point them back.
    return (
      <div className="min-h-screen">
        <StaffTopbar area="Admin" />
        <main className="p-6 text-sm text-text-muted">
          Pick a restaurant from the Super Admin dashboard to view its admin panel in Support Mode.
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <StaffTopbar area="Admin" restaurantName={restaurant.name} restaurantSlug={restaurant.slug} />
      {restaurant.status === 'suspended' && <SuspendedBanner />}
      <AdminNav />
      <main className="p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
