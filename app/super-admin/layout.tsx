import { requireRole } from '@/lib/auth/session';
import { StaffTopbar } from '@/components/shared/staff-topbar';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  // super_admin is the only role that ever legitimately lands here; requireRole
  // still checks it explicitly (rather than relying on it being the fallback)
  // so this stays correct if the fallback behavior in session.ts ever changes.
  await requireRole(['super_admin']);

  return (
    <div className="min-h-screen">
      <StaffTopbar area="Super Admin" />
      <main className="p-6">{children}</main>
    </div>
  );
}
