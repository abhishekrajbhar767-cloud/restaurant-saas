import { registerPlugin } from '@capacitor/core';

export type AlertRingStartOptions = {
  title: string;
  body: string;
  type: string;
  tableNumber: string;
  orderId?: string;
  requestId?: string;
};

export interface AlertRingPlugin {
  start(options: AlertRingStartOptions): Promise<void>;
  stop(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<{ requested: boolean }>;
}

const AlertRing = registerPlugin<AlertRingPlugin>('AlertRing', {
  web: () => import('./alert-ring.web').then((m) => new m.AlertRingWeb()),
});

export { AlertRing };
