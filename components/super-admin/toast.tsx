'use client';

import { useEffect } from 'react';

export function SuperAdminToast({
  message,
  onGone,
}: {
  message: string | null;
  onGone: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onGone, 4000);
    return () => window.clearTimeout(timer);
  }, [message, onGone]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-success/40 bg-ink-900 px-4 py-2.5 text-sm font-medium text-success shadow-panel"
    >
      {message}
    </div>
  );
}
