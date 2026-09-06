import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth/session';

/** Alias for /super-admin. Prefer the next.config redirect; this is the fallback gate. */
export default async function AdminSuperAliasPage() {
  await requireSuperAdmin();
  redirect('/super-admin');
}
