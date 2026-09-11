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

export interface AlertRingPlugin {
  start(options: AlertRingStartOptions): Promise<void>;
  stop(): Promise<void>;
  checkAlertPermissions(): Promise<AlertPermissionStatus>;
  requestIgnoreBatteryOptimizations(): Promise<PermissionPromptResult>;
  requestOverlayPermission(): Promise<PermissionPromptResult>;
  requestFullScreenIntentPermission(): Promise<PermissionPromptResult>;
  requestCriticalPermissions(): Promise<{ opened: string }>;
  requestLocationPermissions(): Promise<{ granted: boolean }>;
}

const AlertRing = registerPlugin<AlertRingPlugin>('AlertRing', {
  web: () => import('./alert-ring.web').then((m) => new m.AlertRingWeb()),
});

export { AlertRing };
