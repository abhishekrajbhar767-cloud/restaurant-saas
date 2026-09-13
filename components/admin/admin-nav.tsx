'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { InventoryItem } from '@/types/database';

const TABS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/manager', label: 'Manager', managerOnly: true },
  { href: '/admin/menu', label: 'Menu' },
  { href: '/admin/tables', label: 'Tables' },
  { href: '/admin/inventory', label: 'Inventory', inventoryOnly: true },
  { href: '/admin/staff', label: 'Staff' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/settings', label: 'Settings' },
];

// canManage is a display decision only. /admin/manager re-derives the role
// server-side and RLS re-derives it again, so hiding the tab is convenience,
// never the thing that keeps the route safe. Same for inventoryEnabled — the
// restaurant's inventory_tracking_enabled toggle just hides the tab when the
// feature is off; a route or RPC under /admin/inventory (phase 2) is what
// actually has to check it.
export function AdminNav({ canManage, inventoryEnabled, restaurantId, initialLowStockCount }: {
  canManage: boolean;
  inventoryEnabled: boolean;
  restaurantId: string;
  initialLowStockCount: number;
}) {
  const pathname = usePathname();
  const [lowStockCount, setLowStockCount] = useState(initialLowStockCount);

  useEffect(() => setLowStockCount(initialLowStockCount), [initialLowStockCount]);

  useEffect(() => {
    if (!inventoryEnabled) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-inventory-alert-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          // Recount after any stock/create/delete event. This also stays correct
          // if an ingredient's alert limit changes in a future phase.
          void supabase.rpc('get_low_stock_count', { p_restaurant_id: restaurantId }).then(({ data, error }) => {
            if (!error && typeof data === 'number') setLowStockCount(data);
          });
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [inventoryEnabled, restaurantId]);

  return (
    <nav className="border-b border-line bg-ink-900 px-6 flex gap-1" aria-label="Admin sections">
      {TABS.filter((tab) => (!tab.managerOnly || canManage) && (!tab.inventoryOnly || inventoryEnabled)).map((tab) => {
        const active = tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2.5 text-sm font-display border-b-2 transition-colors ${
              active ? 'border-amber text-amber' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {tab.inventoryOnly && lowStockCount > 0 && (
                <span
                  aria-label={`${lowStockCount} low-stock ingredient${lowStockCount === 1 ? '' : 's'}`}
                  title={`${lowStockCount} low-stock ingredient${lowStockCount === 1 ? '' : 's'}`}
                  className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-white"
                >
                  {lowStockCount > 99 ? '99+' : lowStockCount}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
