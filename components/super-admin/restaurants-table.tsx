'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SubscriptionBadge } from '@/components/super-admin/subscription-badge';
import { ExtendPlanModal } from '@/components/super-admin/extend-plan-modal';
import type { RestaurantOverviewRow, TrackingStatus } from '@/types/database';
import {
  expiryCaption,
  formatExpiresOn,
  overviewExpiryAt,
  planLabel,
  trackingStatus,
} from '@/lib/super-admin/subscription';

type TrackingFilter = 'all' | TrackingStatus;

const ROW_TONE: Record<TrackingStatus, string> = {
  expired: 'bg-danger/10 border-l-4 border-l-danger',
  expiring_soon: 'bg-amber/10 border-l-4 border-l-amber',
  active: 'bg-success/10 border-l-4 border-l-success',
};

export function RestaurantsTable({ restaurants }: { restaurants: RestaurantOverviewRow[] }) {
  const [query, setQuery] = useState('');
  const [trackingFilter, setTrackingFilter] = useState<TrackingFilter>('all');
  const [planTarget, setPlanTarget] = useState<RestaurantOverviewRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return restaurants.filter((r) => {
      const expiry = overviewExpiryAt(r);
      const tracking = trackingStatus(expiry);
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.owner_email ?? '').toLowerCase().includes(q);
      const matchesTracking = trackingFilter === 'all' || tracking === trackingFilter;
      return matchesQuery && matchesTracking;
    });
  }, [restaurants, query, trackingFilter]);

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-line">
        <div>
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-amber">Subscription tracking</h2>
          <p className="text-xs text-text-muted mt-0.5">Sorted expired first, then expiring within 7 days, then active.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="search"
            placeholder="Search restaurants…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field-input sm:max-w-xs"
            aria-label="Search restaurants"
          />
          <select
            value={trackingFilter}
            onChange={(e) => setTrackingFilter(e.target.value as TrackingFilter)}
            className="field-input sm:max-w-[200px]"
            aria-label="Filter by subscription status"
          >
            <option value="all">All statuses</option>
            <option value="expired">Expired</option>
            <option value="expiring_soon">Expiring soon (7 days)</option>
            <option value="active">Active</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-text-muted border-b border-line">
              <th className="px-4 py-3 font-medium">Restaurant</th>
              <th className="px-4 py-3 font-medium">Plan type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Expiration date</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  No restaurants match your search.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const expiry = overviewExpiryAt(r);
              const tracking = trackingStatus(expiry);
              const caption = expiryCaption(expiry);
              return (
                <tr
                  key={r.restaurant_id}
                  className={`border-b border-line last:border-b-0 hover:bg-ink-800/40 ${ROW_TONE[tracking]}`}
                >
                  <td className="px-4 py-3">
                    <Link href={`/super-admin/restaurants/${r.restaurant_id}`} className="font-display font-medium hover:text-amber">
                      {r.name}
                    </Link>
                    {r.owner_email && <div className="text-xs text-text-muted">{r.owner_email}</div>}
                  </td>
                  <td className="px-4 py-3">{planLabel(r.plan_type)}</td>
                  <td className="px-4 py-3">
                    <SubscriptionBadge status={tracking} />
                  </td>
                  <td className="px-4 py-3">
                    <div className={`font-medium ${tracking === 'expired' ? 'text-danger' : tracking === 'expiring_soon' ? 'text-amber' : 'text-success'}`}>
                      {formatExpiresOn(expiry)}
                    </div>
                    {caption && <div className="text-xs text-text-muted mt-0.5">{caption}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={() => setPlanTarget(r)}>
                      Manage Plan
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {planTarget && (
        <ExtendPlanModal
          restaurantId={planTarget.restaurant_id}
          restaurantName={planTarget.name}
          planType={planTarget.plan_type}
          trialEndsAt={planTarget.trial_ends_at}
          expiresAt={planTarget.expires_at}
          subscriptionExpiresAt={planTarget.subscription_expires_at}
          subscriptionStatus={planTarget.subscription_status}
          onClose={() => setPlanTarget(null)}
        />
      )}
    </div>
  );
}
