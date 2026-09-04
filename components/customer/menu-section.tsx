'use client';

import { ChevronDownIcon } from '@/components/customer/icons';

export function MenuSection({
  id,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = `${id}-panel`;
  return (
    <section id={id} className="scroll-mt-36 border-b border-white/[0.06] pb-2 last:border-0">
      <h2 className="mt-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 py-3 text-left"
        >
          <span className="font-display text-lg font-bold tracking-tight text-white">
            {title} <span className="text-zinc-500">({count})</span>
          </span>
          <ChevronDownIcon
            size={20}
            className={`shrink-0 text-zinc-300 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="divide-y divide-white/[0.06] lg:grid lg:grid-cols-2 lg:gap-x-10 lg:divide-y-0 lg:[&>*]:border-b lg:[&>*]:border-white/[0.06]">
        {children}
      </div>
    </section>
  );
}
