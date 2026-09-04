import Link from 'next/link';
import { signOut } from '@/app/auth/login/actions';
import { PublicPageActions } from '@/components/shared/public-page-actions';

export function StaffTopbar({
  area,
  restaurantName,
  restaurantSlug,
  supportMode = false,
  backHref,
  backLabel = 'Back to work',
  showShiftLink = true,
}: {
  area: string;
  restaurantName?: string;
  restaurantSlug?: string;
  supportMode?: boolean;
  /** Set on side-trip screens (e.g. /staff) so there's a way out that isn't the browser's back button. */
  backHref?: string;
  backLabel?: string;
  showShiftLink?: boolean;
}) {
  return (
    <>
      {supportMode && (
        <div className="bg-amber text-ink-950 text-center text-xs font-display font-bold tracking-wide py-1.5">
          SUPER ADMIN SUPPORT MODE — actions here are logged
        </div>
      )}
      <header className="border-b border-line bg-ink-900 px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex shrink-0 items-center gap-1 self-center rounded border border-line px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-ink-800 hover:text-text"
            >
              <span aria-hidden>←</span>
              {backLabel}
            </Link>
          )}
          <span className="font-display font-bold text-sm">Smart Restaurant OS</span>
          <span className="text-text-muted text-xs uppercase tracking-wide">{area}</span>
          {restaurantName && <span className="text-xs text-amber font-mono truncate">{restaurantName}</span>}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {restaurantSlug && <PublicPageActions restaurantSlug={restaurantSlug} />}
          {/* Only tenant staff have a shift; a super admin has no membership to clock. */}
          {restaurantName && showShiftLink && (
            <Link href="/staff" className="text-xs text-text-muted hover:text-text underline underline-offset-2">
              My Shift
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className="text-xs text-text-muted hover:text-text underline underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      </header>
    </>
  );
}
