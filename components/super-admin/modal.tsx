'use client';

import { useEffect } from 'react';

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-ink-950/80" onClick={onClose} aria-label="Close dialog" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="super-admin-modal-title"
        className="card relative z-10 w-full max-w-md p-6 shadow-panel"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id="super-admin-modal-title" className="font-display font-bold text-lg">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="text-xs text-text-muted hover:text-text underline underline-offset-2">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
