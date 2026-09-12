'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function InventoryModal({ title, children, onClose, busy = false }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    const previouslyFocused = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      className="card m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto p-0 text-text backdrop:bg-ink-950/80">
      <div className="p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog"
            className="rounded p-2 text-text-muted hover:bg-ink-800 hover:text-text disabled:opacity-50">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
