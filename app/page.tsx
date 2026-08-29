import { redirect } from 'next/navigation';
import { getUserContext, homeRouteFor } from '@/lib/auth/session';

export default async function RootPage() {
  const ctx = await getUserContext();

  if (!ctx) {
    redirect('/auth/login');
  }

  redirect(homeRouteFor(ctx));
}
