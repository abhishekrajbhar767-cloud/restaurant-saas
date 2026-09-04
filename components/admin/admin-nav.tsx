'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/manager', label: 'Manager', managerOnly: true },
  { href: '/admin/menu', label: 'Menu' },
  { href: '/admin/tables', label: 'Tables' },
  { href: '/admin/staff', label: 'Staff' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/settings', label: 'Settings' },
];

// canManage is a display decision only. /admin/manager re-derives the role
// server-side and RLS re-derives it again, so hiding the tab is convenience,
// never the thing that keeps the route safe.
export function AdminNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-line bg-ink-900 px-6 flex gap-1" aria-label="Admin sections">
      {TABS.filter((tab) => !tab.managerOnly || canManage).map((tab) => {
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
