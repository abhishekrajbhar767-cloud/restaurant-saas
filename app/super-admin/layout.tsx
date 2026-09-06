import { requireSuperAdmin } from '@/lib/auth/session';
import { StaffTopbar } from '@/components/shared/staff-topbar';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  // Role is re-derived from restaurant_members on every request — not from JWT
  // metadata the client could tamper with. Middleware only checks that someone
  // is logged in; this is the check that keeps tenant staff out.
  await requireSuperAdmin();

  return (
    <div className="min-h-screen">
      <StaffTopbar area="Super Admin" />
      <main className="p-6">{children}</main>
    </div>
  );
}
