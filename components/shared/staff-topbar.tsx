import { signOut } from '@/app/auth/login/actions';

export function StaffTopbar({
  area,
  restaurantName,
  supportMode = false,
}: {
  area: string;
  restaurantName?: string;
  supportMode?: boolean;
}) {
  return (
    <>
      {supportMode && (
        <div className="bg-amber text-ink-950 text-center text-xs font-display font-bold tracking-wide py-1.5">
          SUPER ADMIN SUPPORT MODE — actions here are logged
        </div>
      )}
      <header className="border-b border-line bg-ink-900 px-6 py-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-display font-bold text-sm">Smart Restaurant OS</span>
          <span className="text-text-muted text-xs uppercase tracking-wide">{area}</span>
          {restaurantName && <span className="text-xs text-amber font-mono">{restaurantName}</span>}
        </div>
        <form action={signOut}>
          <button type="submit" className="text-xs text-text-muted hover:text-text underline underline-offset-2">
            Sign out
          </button>
        </form>
      </header>
    </>
  );
}
