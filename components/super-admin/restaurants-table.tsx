'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { RestaurantStatusBadge } from '@/components/shared/status-badge';
import { setRestaurantStatus } from '@/app/super-admin/actions';
import type { RestaurantOverviewRow, RestaurantStatus } from '@/types/database';

// Filters run client-side against the full overview list. Fine at the scale
// a super_admin can eyeball in one table (dozens to low hundreds of
// restaurants); past that, this is the first place to move to server-side
// search — see section 44 in the spec on pagination for 1000+ tenants.
export function RestaurantsTable({ restaurants }: { restaurants: RestaurantOverviewRow[] }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RestaurantStatus>('all');
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return restaurants.filter((r) => {
      const matchesQuery = !q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q) || (r.owner_name ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [restaurants, query, statusFilter]);

  function handleStatusChange(id: string, status: RestaurantStatus) {
    setPendingId(id);
    startTransition(async () => {
      await setRestaurantStatus(id, status);
      setPendingId(null);
    });
  }

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-line">
        <input
          type="search"
          placeholder="Search by name, slug, or owner…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field-input sm:max-w-xs"
          aria-label="Search restaurants"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="field-input sm:max-w-[160px]"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-text-muted border-b border-line">
              <th className="px-4 py-3 font-medium">Restaurant</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Tables</th>
              <th className="px-4 py-3 font-medium text-right">Staff</th>
              <th className="px-4 py-3 font-medium text-right">Today</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-text-muted">
                  No restaurants match your search.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.restaurant_id} className="border-b border-line last:border-0 hover:bg-ink-800/50">
                <td className="px-4 py-3">
                  <Link href={`/super-admin/restaurants/${r.restaurant_id}`} className="font-display font-medium hover:text-amber">
                    {r.name}
                  </Link>
                  <div className="text-xs text-text-muted font-mono">/{r.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <div>{r.owner_name ?? '—'}</div>
                  <div className="text-xs text-text-muted">{r.owner_email ?? 'No owner assigned'}</div>
                </td>
                <td className="px-4 py-3">
                  <RestaurantStatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right font-mono">{r.table_count}</td>
                <td className="px-4 py-3 text-right font-mono">{r.staff_count}</td>
                <td className="px-4 py-3 text-right font-mono">{r.today_order_count}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 flex-wrap">
                    <Link href={`/super-admin/restaurants/${r.restaurant_id}`} className="text-xs underline underline-offset-2 text-text-muted hover:text-text">
                      View
                    </Link>
                    {r.status !== 'active' && (
                      <button
                        onClick={() => handleStatusChange(r.restaurant_id, 'active')}
                        disabled={isPending && pendingId === r.restaurant_id}
                        className="text-xs underline underline-offset-2 text-success hover:opacity-80 disabled:opacity-50"
                      >
                        Activate
                      </button>
                    )}
                    {r.status === 'active' && (
                      <button
                        onClick={() => handleStatusChange(r.restaurant_id, 'suspended')}
                        disabled={isPending && pendingId === r.restaurant_id}
                        className="text-xs underline underline-offset-2 text-danger hover:opacity-80 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                    {r.status !== 'archived' && (
                      <button
                        onClick={() => handleStatusChange(r.restaurant_id, 'archived')}
                        disabled={isPending && pendingId === r.restaurant_id}
                        className="text-xs underline underline-offset-2 text-text-muted hover:text-text disabled:opacity-50"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
