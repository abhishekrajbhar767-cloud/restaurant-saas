import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-ink-950 text-text">
      <div className="max-w-sm text-center">
        <div className="font-display text-amber text-sm tracking-[0.2em] mb-3">404</div>
        <h1 className="font-display text-xl font-bold mb-2">Nothing here</h1>
        <p className="text-sm text-text-muted mb-6">The page you're looking for doesn't exist or has moved.</p>
        <Link href="/" className="btn-primary">
          Go home
        </Link>
      </div>
    </div>
  );
}
