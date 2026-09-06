import type { CapacitorConfig } from '@capacitor/cli';

// This app is a Next.js server (auth cookies, Server Actions, RLS-backed
// RPCs). Capacitor's static `webDir` bundle cannot host that, so the Android
// WebView loads the deployed site. Set CAPACITOR_SERVER_URL for a LAN
// live-reload (`http://192.168.x.x:3000`); production APKs use NEXT_PUBLIC_SITE_URL.
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? process.env.NEXT_PUBLIC_SITE_URL;

const config: CapacitorConfig = {
  appId: 'com.smartrestaurant.staff',
  appName: 'Restaurant OS',
  webDir: 'native-shell',
  backgroundColor: '#0E1116',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
      }
    : undefined,
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
  },
};

export default config;
