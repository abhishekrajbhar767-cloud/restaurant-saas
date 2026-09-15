import { registerPlugin } from '@capacitor/core';

export type AlertRingStartOptions = {
  title: string;
  body: string;
  type: string;
  tableNumber: string;
  orderId?: string;
  requestId?: string;
};

export type AlertPermissionStatus = {
  overlay: boolean;
  batteryOptimizationsIgnored: boolean;
  fullScreenIntent: boolean;
  location: boolean;
};

export type PermissionPromptResult = {
  granted: boolean;
  requested: boolean;
};

export type VerifiedLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  /** Android's own verdict on the fix — true when a mock provider supplied it. */
  isMock: boolean;
};

export interface AlertRingPlugin {
  start(options: AlertRingStartOptions): Promise<void>;
  stop(): Promise<void>;
  checkAlertPermissions(): Promise<AlertPermissionStatus>;
  requestIgnoreBatteryOptimizations(): Promise<PermissionPromptResult>;
  requestOverlayPermission(): Promise<PermissionPromptResult>;
  requestFullScreenIntentPermission(): Promise<PermissionPromptResult>;
  requestCriticalPermissions(): Promise<{ opened: string }>;
  requestLocationPermissions(): Promise<{ granted: boolean }>;
  /** Opens ACTION_APPLICATION_DETAILS_SETTINGS — the only route back from a permanently denied permission. */
  openAppSettings(): Promise<{ opened: boolean }>;
  /** A platform location fix plus Android's mock-provider verdict. Rejects with LOCATION_* codes. */
  getVerifiedLocation(): Promise<VerifiedLocation>;
}

const AlertRing = registerPlugin<AlertRingPlugin>('AlertRing', {
  web: () => import('./alert-ring.web').then((m) => new m.AlertRingWeb()),
});

export { AlertRing };
