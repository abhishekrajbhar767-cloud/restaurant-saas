// lib/shared/wake-lock.ts
// Screen Wake Lock keeps the waiter's phone screen on, because mobile
// browsers throttle timers and suspend Web Audio when the screen turns off —
// which would silently kill the ring/vibration loops.
//
// The lock is released by the browser when the tab is hidden; callers should
// re-request it from a visibilitychange handler when the tab becomes visible
// again. TypeScript's DOM lib doesn't ship WakeLock types, so minimal ones
// are declared here.

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
};

let sentinel: WakeLockSentinelLike | null = null;

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export function isWakeLockHeld(): boolean {
  return sentinel !== null;
}

/** Idempotent — safe to call repeatedly; denied requests resolve silently. */
export async function requestWakeLock(): Promise<void> {
  if (!isWakeLockSupported() || sentinel) return;
  const nav = navigator as WakeLockCapableNavigator;
  try {
    const s = await nav.wakeLock!.request('screen');
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null;
    });
    sentinel = s;
  } catch {
    // Denied or transient failure — the screen will sleep normally; loops
    // resume once the user returns to the tab.
  }
}

export async function releaseWakeLock(): Promise<void> {
  const s = sentinel;
  sentinel = null;
  try {
    await s?.release();
  } catch {
    // Already released by the browser — nothing to do.
  }
}
