import type { PlanType, RestaurantOverviewRow, SubscriptionStatus } from '@/types/database';

export const EXPIRING_SOON_DAYS = 3;
export const DEFAULT_TRIAL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ExpiryUrgency = 'expired' | 'soon' | 'ok';

export function relevantExpiryAt(planType: PlanType | null, trialEndsAt: string | null, expiresAt: string | null): string | null {
  if (planType === 'trial' || (!planType && trialEndsAt && !expiresAt)) {
    return trialEndsAt;
  }
  return expiresAt ?? trialEndsAt;
}

export function overviewExpiryAt(row: Pick<RestaurantOverviewRow, 'plan_type' | 'trial_ends_at' | 'expires_at'>): string | null {
  return relevantExpiryAt(row.plan_type, row.trial_ends_at, row.expires_at);
}

export function effectiveSubscriptionStatus(
  planType: PlanType | null,
  trialEndsAt: string | null,
  expiresAt: string | null
): SubscriptionStatus {
  const iso = relevantExpiryAt(planType, trialEndsAt, expiresAt);
  const now = Date.now();
  if (planType === 'trial' || !planType) {
    return iso && new Date(iso).getTime() > now ? 'trialing' : 'expired';
  }
  return iso && new Date(iso).getTime() > now ? 'active' : 'expired';
}

export function expiryUrgency(iso: string | null, now = Date.now()): ExpiryUrgency {
  if (!iso) return 'ok';
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'expired';
  if (ms <= EXPIRING_SOON_DAYS * MS_PER_DAY) return 'soon';
  return 'ok';
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
  if (plan === 'annual') return 'Annual';
  if (plan === 'trial') return 'Trial';
  return '—';
}

export function billingStats(rows: RestaurantOverviewRow[]) {
  const now = Date.now();
  let trialing = 0;
  let expired = 0;
  let expiringSoon = 0;
  for (const row of rows) {
    const status = row.subscription_status;
    if (!status) continue;
    const urgency = expiryUrgency(overviewExpiryAt(row), now);
    if (status === 'trialing') trialing += 1;
    if (status === 'expired' || urgency === 'expired') expired += 1;
    if (urgency === 'soon') expiringSoon += 1;
  }
  return { trialing, expired, expiringSoon };
}
