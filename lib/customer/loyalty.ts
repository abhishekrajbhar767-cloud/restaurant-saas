// lib/customer/loyalty.ts
// Loyalty session lives in localStorage, keyed by restaurant, so a guest
// who joined on this phone stays signed in across visits without an account.
// visits_count is refreshed from get_loyalty_customer() on load — the stored
// copy is only a fallback for offline / RPC failure.

import type { Customer } from '@/types/database';

export type LoyaltySession = {
  name: string;
  mobile_number: string;
  visits_count: number;
};

export const LOYALTY_REWARD_AT_VISITS = 4;
export const LOYALTY_BANNER_COPY = 'Unlock 10% OFF on your 5th visit! Join now.';

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

export function isLoyaltyRewardVisit(visitsCount: number | null | undefined): boolean {
  return visitsCount === LOYALTY_REWARD_AT_VISITS;
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
