'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/menu', label: 'Menu' },
  { href: '/admin/tables', label: 'Tables' },
  { href: '/admin/staff', label: 'Staff' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-line bg-ink-900 px-6 flex gap-1" aria-label="Admin sections">
      {TABS.map((tab) => {
        const active = tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2.5 text-sm font-display border-b-2 transition-colors ${
              active ? 'border-amber text-amber' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
