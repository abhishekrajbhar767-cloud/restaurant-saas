// lib/customer/loyalty.ts
// Loyalty session lives in localStorage, keyed by restaurant, so a guest
// who joined on this phone stays signed in across visits without an account.
// visits_count is refreshed from get_loyalty_customer() on load — the stored
// copy is only a fallback for offline / RPC failure.
//
// Reward math is driven by loyalty_settings: the current order is the
// reward visit when visits_count === visit_threshold - 1.

import type { Customer, LoyaltySettings } from '@/types/database';

export type LoyaltySession = {
  name: string;
  mobile_number: string;
  visits_count: number;
};

export const DEFAULT_VISIT_THRESHOLD = 5;
export const DEFAULT_DISCOUNT_PERCENTAGE = 10;

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function defaultLoyaltyText(threshold = DEFAULT_VISIT_THRESHOLD, percent = DEFAULT_DISCOUNT_PERCENTAGE): string {
  return `Get ${percent}% OFF on your ${ordinal(threshold)} visit!`;
}

export function fallbackLoyaltySettings(restaurantId: string, isEnabled = false): LoyaltySettings {
  return {
    restaurant_id: restaurantId,
    is_enabled: isEnabled,
    visit_threshold: DEFAULT_VISIT_THRESHOLD,
    discount_percentage: DEFAULT_DISCOUNT_PERCENTAGE,
    custom_text: defaultLoyaltyText(),
    banner_image_url: null,
    updated_at: new Date(0).toISOString(),
  };
}

export function loyaltyBannerCopy(settings: Pick<LoyaltySettings, 'custom_text' | 'visit_threshold' | 'discount_percentage'>): string {
  const text = settings.custom_text.trim();
  return text || defaultLoyaltyText(settings.visit_threshold, settings.discount_percentage);
}

export function loyaltyStorageKey(restaurantId: string): string {
  return `loyalty:${restaurantId}`;
}

export function loadLoyaltySession(restaurantId: string): LoyaltySession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(loyaltyStorageKey(restaurantId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isLoyaltySession(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLoyaltySession(restaurantId: string, session: LoyaltySession) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(loyaltyStorageKey(restaurantId), JSON.stringify(session));
  } catch {
    // private mode / quota — the in-memory session on the page still works
  }
}

export function clearLoyaltySession(restaurantId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(loyaltyStorageKey(restaurantId));
  } catch {
    // see note above
  }
}

export function sessionFromCustomer(customer: Customer): LoyaltySession {
  return {
    name: customer.name,
    mobile_number: customer.mobile_number,
    visits_count: customer.visits_count,
  };
}

export function isLoyaltyRewardVisit(
  visitsCount: number | null | undefined,
  visitThreshold = DEFAULT_VISIT_THRESHOLD
): boolean {
  return visitsCount === visitThreshold - 1;
}

function isLoyaltySession(value: unknown): value is LoyaltySession {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === 'string' &&
    typeof row.mobile_number === 'string' &&
    typeof row.visits_count === 'number' &&
    Number.isFinite(row.visits_count)
  );
}
