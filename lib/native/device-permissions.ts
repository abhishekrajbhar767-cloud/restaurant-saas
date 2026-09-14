// lib/native/device-permissions.ts
//
// The actual OS/browser permission state, read fresh every time — nothing
// here is cached in localStorage. A staff member who reinstalls the app or
// clears site data loses their OS grants, and the next mount of
// AppPermissionsGate has to see that immediately, not trust a stale flag.
//
// Status is checked via the Web Permissions API wherever it's available —
// Capacitor's Android WebView is Chromium-based, so navigator.permissions
// works there too, and it's the only path that reliably distinguishes
// "denied" (the OS will refuse to prompt again) from "prompt" (never asked).
// The actual *request* prefers native Capacitor plugins when this is a
// native build, since those are the flows already wired to this app's real
// permission dialogs (AlertRing for location, PushNotifications for FCM).

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { AlertRing } from '@/lib/native/alert-ring';

export type PermissionKind = 'location' | 'camera' | 'notifications' | 'battery';
export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * The three capabilities the /permissions screen blocks on. Camera is
 * deliberately absent — nothing in the app scans anything yet, so gating on
 * it would be friction with no feature behind it. It stays implemented below
 * so adding it here is a one-line change the day a scanner ships.
 */
export const REQUIRED_PERMISSIONS: PermissionKind[] = ['location', 'notifications', 'battery'];

const WEB_PERMISSION_NAME: Record<PermissionKind, string> = {
  location: 'geolocation',
  camera: 'camera',
  notifications: 'notifications',
  // Battery optimization is an Android settings toggle, not a Web Permissions
  // API descriptor — this entry exists only to satisfy the record type and is
  // never queried (checkBattery short-circuits before reaching it).
  battery: '',
};

async function queryWebPermission(kind: PermissionKind): Promise<PermissionState | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
  try {
    const result = await navigator.permissions.query({ name: WEB_PERMISSION_NAME[kind] as PermissionName });
    if (result.state === 'granted' || result.state === 'denied' || result.state === 'prompt') return result.state;
    return null;
  } catch {
    // Some browsers recognize navigator.permissions but reject an unknown
    // descriptor name (camera/notifications support is inconsistent) —
    // treated the same as "no answer available", not as unsupported.
    return null;
  }
}

async function checkLocation(): Promise<PermissionState> {
  const web = await queryWebPermission('location');
  if (web) return web;

  if (Capacitor.isNativePlatform()) {
    try {
      const status = await AlertRing.checkAlertPermissions();
      return status.location ? 'granted' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  return 'prompt';
}

async function requestLocation(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await AlertRing.requestLocationPermissions();
      if (result.granted) return 'granted';
      // The native plugin only returns a boolean, so re-check through the
      // Web Permissions API (if this WebView supports it) to tell a real
      // "permanently denied" apart from "dismissed the dialog this time".
      const web = await queryWebPermission('location');
      return web ?? 'denied';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (error) => resolve(error.code === error.PERMISSION_DENIED ? 'denied' : 'prompt'),
      { timeout: 10_000 }
    );
  });
}

async function checkCamera(): Promise<PermissionState> {
  const web = await queryWebPermission('camera');
  if (web) return web;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
  // No status API answered — asking would mean opening the camera just to
  // check, which is not appropriate for a passive mount-time read. Treat as
  // unknown/not-yet-granted so the gate offers a Grant button instead of
  // silently letting the app through.
  return 'prompt';
}

async function requestCamera(): Promise<PermissionState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
      return 'denied';
    }
    // NotFoundError (no camera hardware) and similar — nothing the user can
    // grant, so this device simply doesn't gate on camera.
    return 'unsupported';
  }
}

async function checkNotifications(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await PushNotifications.checkPermissions();
      return mapPushState(status.receive);
    } catch {
      return 'unsupported';
    }
  }

  const web = await queryWebPermission('notifications');
  if (web) return web;
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

async function requestNotifications(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await PushNotifications.requestPermissions();
      return mapPushState(status.receive);
    } catch {
      return 'unsupported';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  const result = await Notification.requestPermission();
  return result === 'default' ? 'prompt' : result;
}

function mapPushState(receive: string): PermissionState {
  if (receive === 'granted') return 'granted';
  if (receive === 'denied') return 'denied';
  return 'prompt'; // 'prompt' or 'prompt-with-rationale'
}

// "Unrestricted background usage". Not a runtime permission — there is no
// prompt to permanently deny, so this is only ever granted or not-yet-granted:
// the user can always flip it back on in system settings.
async function checkBattery(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  try {
    const status = await AlertRing.checkAlertPermissions();
    return status.batteryOptimizationsIgnored ? 'granted' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

async function requestBattery(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  try {
    const result = await AlertRing.requestIgnoreBatteryOptimizations();
    if (result.granted) return 'granted';
    // requestIgnoreBatteryOptimizations hands off to a system screen, so the
    // outcome lands after the user comes back — "Recheck & Continue" is what
    // actually resolves it, not this return value.
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** Opens the app's own page in system Settings (Android only). */
export async function openAppSettings(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await AlertRing.openAppSettings();
    return result.opened;
  } catch {
    return false;
  }
}

export async function checkPermission(kind: PermissionKind): Promise<PermissionState> {
  if (kind === 'location') return checkLocation();
  if (kind === 'camera') return checkCamera();
  if (kind === 'battery') return checkBattery();
  return checkNotifications();
}

export async function requestPermission(kind: PermissionKind): Promise<PermissionState> {
  if (kind === 'location') return requestLocation();
  if (kind === 'camera') return requestCamera();
  if (kind === 'battery') return requestBattery();
  return requestNotifications();
}

export type PermissionSnapshot = { kind: PermissionKind; state: PermissionState };

/** Reads every required capability's live state, in parallel. */
export async function checkRequiredPermissions(): Promise<PermissionSnapshot[]> {
  return Promise.all(REQUIRED_PERMISSIONS.map(async (kind) => ({ kind, state: await checkPermission(kind) })));
}

/**
 * A capability nothing on this platform can grant (web, or a ROM without the
 * screen) must not be able to lock someone out of the app forever.
 */
export function isSatisfied(state: PermissionState): boolean {
  return state === 'granted' || state === 'unsupported';
}

export function allSatisfied(snapshots: PermissionSnapshot[]): boolean {
  return snapshots.every((snapshot) => isSatisfied(snapshot.state));
}
