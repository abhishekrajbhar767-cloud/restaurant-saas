'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { RestaurantStatusBadge } from '@/components/shared/status-badge';
import { SubscriptionBadge } from '@/components/super-admin/subscription-badge';
import { ResetPasswordModal } from '@/components/super-admin/reset-password-modal';
import { ExtendPlanModal } from '@/components/super-admin/extend-plan-modal';
import { setRestaurantStatus } from '@/app/super-admin/actions';
import type { RestaurantOverviewRow, RestaurantStatus, SubscriptionStatus } from '@/types/database';
import { expiryCaption, expiryUrgency, formatExpiry, overviewExpiryAt, planLabel } from '@/lib/super-admin/subscription';

type BillingFilter = 'all' | SubscriptionStatus | 'soon';

const ROW_TONE: Record<ReturnType<typeof expiryUrgency>, string> = {
  expired: 'bg-danger/10 border-l-4 border-l-danger',
  soon: 'bg-amber/10 border-l-4 border-l-amber',
  ok: '',
};

export function RestaurantsTable({ restaurants }: { restaurants: RestaurantOverviewRow[] }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RestaurantStatus>('all');
  const [billingFilter, setBillingFilter] = useState<BillingFilter>('all');
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<RestaurantOverviewRow | null>(null);
  const [planTarget, setPlanTarget] = useState<RestaurantOverviewRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return restaurants.filter((r) => {
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.owner_name ?? '').toLowerCase().includes(q) ||
        (r.owner_email ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const urgency = expiryUrgency(overviewExpiryAt(r));
      const matchesBilling =
        billingFilter === 'all' ||
        (billingFilter === 'soon' && urgency === 'soon') ||
        (billingFilter !== 'soon' && r.subscription_status === billingFilter);
      return matchesQuery && matchesStatus && matchesBilling;
    });
  }, [restaurants, query, statusFilter, billingFilter]);

  function handleStatusChange(id: string, status: RestaurantStatus) {
    setPendingId(id);
    startTransition(async () => {
      await setRestaurantStatus(id, status);
      setPendingId(null);
    });
  }

  return (
    <div className="card">
      <div className="flex flex-col lg:flex-row gap-3 p-4 border-b border-line">
        <input
          type="search"
          placeholder="Search by name, slug, owner, or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field-input sm:max-w-xs"
          aria-label="Search restaurants"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="field-input sm:max-w-[160px]"
          aria-label="Filter by restaurant status"
        >
          <option value="all">All restaurants</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={billingFilter}
          onChange={(e) => setBillingFilter(e.target.value as BillingFilter)}
          className="field-input sm:max-w-[180px]"
          aria-label="Filter by plan status"
        >
          <option value="all">All plans</option>
          <option value="trialing">On trial</option>
          <option value="active">Paid active</option>
          <option value="soon">Expiring in 3 days</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-text-muted border-b border-line">
              <th className="px-4 py-3 font-medium">Restaurant</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Billing</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Ops</th>
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
            {filtered.map((r) => {
              const expiry = overviewExpiryAt(r);
              const urgency = expiryUrgency(expiry);
              const caption = expiryCaption(expiry);
              return (
                <tr
                  key={r.restaurant_id}
                  className={`border-b border-line last:border-b-0 hover:bg-ink-800/50 ${ROW_TONE[urgency]}`}
                >
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
                  <td className="px-4 py-3">{planLabel(r.plan_type)}</td>
                  <td className="px-4 py-3">
                    <SubscriptionBadge status={r.subscription_status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs">{formatExpiry(expiry)}</div>
                    {caption && (
                      <div className={`text-xs mt-0.5 ${urgency === 'expired' ? 'text-danger' : urgency === 'soon' ? 'text-amber' : 'text-text-muted'}`}>
                        {caption}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RestaurantStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.today_order_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <Link href={`/super-admin/restaurants/${r.restaurant_id}`} className="text-xs underline underline-offset-2 text-text-muted hover:text-text">
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPlanTarget(r)}
                        className="text-xs underline underline-offset-2 text-amber hover:opacity-80"
                      >
                        Extend plan
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetTarget(r)}
                        disabled={!r.owner_user_id}
                        className="text-xs underline underline-offset-2 text-text-muted hover:text-text disabled:opacity-40"
                      >
                        Reset password
                      </button>
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resetTarget && (
        <ResetPasswordModal
          restaurantId={resetTarget.restaurant_id}
          restaurantName={resetTarget.name}
          ownerEmail={resetTarget.owner_email}
          onClose={() => setResetTarget(null)}
        />
      )}
      {planTarget && (
        <ExtendPlanModal
          restaurantId={planTarget.restaurant_id}
          restaurantName={planTarget.name}
          planType={planTarget.plan_type}
          trialEndsAt={planTarget.trial_ends_at}
          expiresAt={planTarget.expires_at}
          subscriptionStatus={planTarget.subscription_status}
          onClose={() => setPlanTarget(null)}
        />
      )}
    </div>
  );
}
