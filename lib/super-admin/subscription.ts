import type { PlanType, RestaurantOverviewRow, SubscriptionStatus, TrackingStatus } from '@/types/database';

export const EXPIRING_SOON_DAYS = 7;
export const DEFAULT_TRIAL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isTrialPlan(plan: PlanType | null): boolean {
  return plan === 'free_trial';
}

export function relevantExpiryAt(
  planType: PlanType | null,
  trialEndsAt: string | null,
  expiresAt: string | null,
  subscriptionExpiresAt?: string | null
): string | null {
  if (subscriptionExpiresAt) return subscriptionExpiresAt;
  if (isTrialPlan(planType) || (!planType && trialEndsAt && !expiresAt)) {
    return trialEndsAt;
  }
  return expiresAt ?? trialEndsAt;
}

export function overviewExpiryAt(
  row: Pick<RestaurantOverviewRow, 'plan_type' | 'trial_ends_at' | 'expires_at' | 'subscription_expires_at'>
): string | null {
  return relevantExpiryAt(row.plan_type, row.trial_ends_at, row.expires_at, row.subscription_expires_at);
}

export function effectiveSubscriptionStatus(
  planType: PlanType | null,
  trialEndsAt: string | null,
  expiresAt: string | null,
  subscriptionExpiresAt?: string | null
): SubscriptionStatus {
  const iso = relevantExpiryAt(planType, trialEndsAt, expiresAt, subscriptionExpiresAt);
  const now = Date.now();
  if (isTrialPlan(planType) || !planType) {
    return iso && new Date(iso).getTime() > now ? 'trialing' : 'expired';
  }
  return iso && new Date(iso).getTime() > now ? 'active' : 'expired';
}

export function trackingStatus(iso: string | null, now = Date.now()): TrackingStatus {
  if (!iso || new Date(iso).getTime() <= now) return 'expired';
  if (new Date(iso).getTime() - now <= EXPIRING_SOON_DAYS * MS_PER_DAY) return 'expiring_soon';
  return 'active';
}

export function formatExpiry(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** e.g. "Expires on 12 Oct 2026" / "Expired on 12 Oct 2026" */
export function formatExpiresOn(iso: string | null, now = Date.now()): string {
  if (!iso) return 'No expiry set';
  const date = new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return new Date(iso).getTime() <= now ? `Expired on ${date}` : `Expires on ${date}`;
}

export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now) / MS_PER_DAY);
}

export function expiryCaption(iso: string | null): string | null {
  const days = daysUntil(iso);
  if (days === null) return null;
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `${days} days left`;
}

export function addDaysIso(fromIso: string | null, days: number, now = new Date()): string {
  const baseMs = fromIso ? new Date(fromIso).getTime() : 0;
  const start = Math.max(baseMs, now.getTime());
  return new Date(start + days * MS_PER_DAY).toISOString();
}

export function planLabel(plan: PlanType | null): string {
  if (plan === 'monthly') return 'Monthly';
  if (plan === 'yearly') return 'Yearly';
  if (plan === 'free_trial') return 'Free Trial';
  return '—';
}

export function trackingRank(status: TrackingStatus): number {
  if (status === 'expired') return 0;
  if (status === 'expiring_soon') return 1;
  return 2;
}

export function sortBySubscriptionExpiry(rows: RestaurantOverviewRow[]): RestaurantOverviewRow[] {
  return [...rows].sort((a, b) => {
    const aIso = overviewExpiryAt(a);
    const bIso = overviewExpiryAt(b);
    const rank = trackingRank(trackingStatus(aIso)) - trackingRank(trackingStatus(bIso));
    if (rank !== 0) return rank;
    if (!aIso && !bIso) return 0;
    if (!aIso) return 1;
    if (!bIso) return -1;
    return new Date(aIso).getTime() - new Date(bIso).getTime();
  });
}

export function billingStats(rows: RestaurantOverviewRow[]) {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  let expiringSoon = 0;
  for (const row of rows) {
    const status = trackingStatus(overviewExpiryAt(row), now);
    if (status === 'expired') expired += 1;
    else if (status === 'expiring_soon') expiringSoon += 1;
    else active += 1;
  }
  return { active, expired, expiringSoon };
}
