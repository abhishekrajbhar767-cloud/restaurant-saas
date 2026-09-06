import { WebPlugin } from '@capacitor/core';
import type { AlertRingPlugin, AlertRingStartOptions } from './alert-ring';

// Browser fallback: the waiter's existing <audio> loop covers web. Native
// Android uses a foreground service so the ring survives a locked screen.
export class AlertRingWeb extends WebPlugin implements AlertRingPlugin {
  async start(_options: AlertRingStartOptions): Promise<void> {
    // no-op — NotificationService plays Native Audio / HTML audio on web
  }

  async stop(): Promise<void> {
    // no-op
  }

  async requestIgnoreBatteryOptimizations(): Promise<{ requested: boolean }> {
    return { requested: false };
  }
}
