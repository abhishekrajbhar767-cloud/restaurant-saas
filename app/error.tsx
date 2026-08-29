'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-ink-950 text-text">
      <div className="max-w-sm text-center">
        <div className="font-display text-danger text-sm tracking-[0.2em] mb-3">SOMETHING WENT WRONG</div>
        <h1 className="font-display text-xl font-bold mb-2">This page hit a snag</h1>
        <p className="text-sm text-text-muted mb-6">
          Nothing was lost — try again, or head back and pick up where you left off.
        </p>
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
      </div>
    </div>
  );
}
