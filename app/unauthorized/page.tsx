import Link from 'next/link';
import { signOut } from '@/app/auth/login/actions';

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="card max-w-sm w-full p-8 text-center">
        <div className="font-display text-danger text-sm tracking-[0.2em] mb-3">ACCESS DENIED</div>
        <h1 className="font-display text-xl font-bold mb-2">This board isn&apos;t yours</h1>
        <p className="text-sm text-text-muted mb-6">
          Your account isn&apos;t cleared for this area. If that&apos;s wrong, ask your restaurant owner to
          check your staff role.
        </p>
        <div className="flex flex-col gap-2">
          <Link href="/" className="btn-secondary">
            Go to my dashboard
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-xs text-text-muted underline underline-offset-2 hover:text-text">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
