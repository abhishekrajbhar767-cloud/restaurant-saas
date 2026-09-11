import { WebPlugin } from '@capacitor/core';
import type {
  AlertPermissionStatus,
  AlertRingPlugin,
  AlertRingStartOptions,
  PermissionPromptResult,
} from './alert-ring';

// Browser fallback: the waiter's existing <audio> loop covers web. Native
// Android uses a foreground service so the ring survives a locked screen.
export class AlertRingWeb extends WebPlugin implements AlertRingPlugin {
  async start(_options: AlertRingStartOptions): Promise<void> {
    // no-op — NotificationService plays Native Audio / HTML audio on web
  }

  async stop(): Promise<void> {
    // no-op
  }

  async checkAlertPermissions(): Promise<AlertPermissionStatus> {
    return {
      overlay: true,
      batteryOptimizationsIgnored: true,
      fullScreenIntent: true,
      location: true,
    };
  }

  async requestIgnoreBatteryOptimizations(): Promise<PermissionPromptResult> {
    return { granted: true, requested: false };
  }

  async requestOverlayPermission(): Promise<PermissionPromptResult> {
    return { granted: true, requested: false };
  }

  async requestFullScreenIntentPermission(): Promise<PermissionPromptResult> {
    return { granted: true, requested: false };
  }

  async requestCriticalPermissions(): Promise<{ opened: string }> {
    return { opened: '' };
  }

  async requestLocationPermissions(): Promise<{ granted: boolean }> {
    return { granted: true };
  }
}
