'use client';

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { PushNotifications, type PushNotificationSchema, type Token } from '@capacitor/push-notifications';
import { NativeAudio } from '@capacitor-community/native-audio';
import { RINGTONE_SRC } from '@/lib/shared/ringtone';
import { AlertRing } from '@/lib/native/alert-ring';
import { parseStaffAlertData, type StaffAlertPayload } from '@/lib/native/staff-alert';
import { registerStaffPushToken } from '@/app/waiter/push-actions';

const RINGTONE_ASSET_ID = 'staff-ringtone';
const RINGTONE_ASSET_PATH = 'public/sounds/ringtone.wav';

export type StaffAlertListener = (alert: StaffAlertPayload) => void;

let started = false;
let ringtoneReady = false;
let htmlAudio: HTMLAudioElement | null = null;
let activeAlert: StaffAlertPayload | null = null;
const listeners = new Set<StaffAlertListener>();

function emit(alert: StaffAlertPayload) {
  listeners.forEach((listener) => listener(alert));
}

function payloadFromNotification(notification: PushNotificationSchema): StaffAlertPayload | null {
  const data = (notification.data ?? {}) as Record<string, string | undefined>;
  return parseStaffAlertData({
    ...data,
    title: data.title ?? notification.title,
    body: data.body ?? notification.body,
  });
}

function ringOptions(alert: StaffAlertPayload) {
  return {
    title: alert.title,
    body: alert.body,
    type: alert.type,
    tableNumber: alert.tableNumber,
    orderId: alert.orderId,
    requestId: alert.requestId,
  };
}

async function ensureHtmlAudio(): Promise<HTMLAudioElement> {
  if (htmlAudio) return htmlAudio;
  const audio = new Audio(RINGTONE_SRC);
  audio.loop = true;
  audio.preload = 'auto';
  htmlAudio = audio;
  return audio;
}

async function preloadNativeRingtone(): Promise<void> {
  if (ringtoneReady || !Capacitor.isNativePlatform()) return;
  try {
    await NativeAudio.configure({ focus: true, fade: false });
    await NativeAudio.preload({
      assetId: RINGTONE_ASSET_ID,
      assetPath: RINGTONE_ASSET_PATH,
      audioChannelNum: 1,
      isUrl: false,
    });
    ringtoneReady = true;
  } catch (error) {
    console.warn('Native ringtone preload failed; HTML audio will be used in the foreground.', error);
  }
}

async function loopForegroundAudio(): Promise<void> {
  try {
    await preloadNativeRingtone();
    if (ringtoneReady) {
      await NativeAudio.loop({ assetId: RINGTONE_ASSET_ID });
      return;
    }
  } catch {
    // Continue to HTML audio.
  }
  const audio = await ensureHtmlAudio();
  try {
    await audio.play();
  } catch {
    // Autoplay blocked until the next user gesture; waiter-app already primes audio.
  }
}

export async function startStaffRingtone(alert?: StaffAlertPayload): Promise<void> {
  if (alert) activeAlert = alert;
  await loopForegroundAudio();
}

export async function stopStaffRingtone(): Promise<void> {
  activeAlert = null;
  if (Capacitor.isNativePlatform()) {
    try {
      await AlertRing.stop();
    } catch {
      // ignore
    }
    if (ringtoneReady) {
      try {
        await NativeAudio.stop({ assetId: RINGTONE_ASSET_ID });
      } catch {
        // ignore
      }
    }
  }
  if (htmlAudio) {
    htmlAudio.pause();
    htmlAudio.currentTime = 0;
  }
}

export function subscribeStaffAlerts(listener: StaffAlertListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function handleStaffAlert(alert: StaffAlertPayload): void {
  void startStaffRingtone(alert);
  emit(alert);
}

async function onRegistration(token: Token): Promise<void> {
  const result = await registerStaffPushToken(token.value);
  if (result.error) {
    console.warn('Failed to register FCM token', result.error);
  }
}

function onPushReceived(notification: PushNotificationSchema): void {
  const alert = payloadFromNotification(notification);
  if (!alert) return;
  handleStaffAlert(alert);
}

function onPushTapped(notification: PushNotificationSchema): void {
  const alert = payloadFromNotification(notification);
  if (!alert) return;
  handleStaffAlert(alert);
}

/**
 * Request notification permission, register the FCM token, and attach
 * foreground + tap listeners. Safe to call more than once; subsequent calls
 * no-op. On the browser waiter dashboard this is a silent no-op so the same
 * host component can render in both shells.
 */
export async function initNotificationService(): Promise<void> {
  if (started || typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  started = true;

  await preloadNativeRingtone();

  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
    permStatus = await PushNotifications.requestPermissions();
  }
  if (permStatus.receive !== 'granted') {
    console.warn('Push notification permission was not granted.');
    return;
  }

  await PushNotifications.register();

  await PushNotifications.addListener('registration', (token) => {
    void onRegistration(token);
  });
  await PushNotifications.addListener('registrationError', (error) => {
    console.warn('FCM registration failed', error.error);
  });
  await PushNotifications.addListener('pushNotificationReceived', onPushReceived);
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    onPushTapped(action.notification);
  });

  await App.addListener('appStateChange', ({ isActive }) => {
    if (!activeAlert) return;
    if (isActive) {
      void loopForegroundAudio();
      return;
    }
    void AlertRing.start(ringOptions(activeAlert));
  });

  try {
    await AlertRing.requestIgnoreBatteryOptimizations();
  } catch {
    // Optional — ringing still works while the OS hasn't killed the process.
  }
}
