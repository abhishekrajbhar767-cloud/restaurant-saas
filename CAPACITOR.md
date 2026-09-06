# Capacitor Android staff app

Waitstaff phones run this Next.js app inside a Capacitor WebView so "Order Ready" and "Call Waiter" alerts can ring like an incoming call when the app is minimized or the screen is off.

This project **does not** use `output: 'export'`. Static export cannot run Server Actions, middleware session cookies, or `requireRole()`. Capacitor loads the hosted site through `server.url` in `capacitor.config.ts`.

## 1. One-time install

From the repo root (already in `package.json`):

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/push-notifications @capacitor-community/native-audio @capacitor/app
npx cap add android
```

`npx cap init` is not required — `capacitor.config.ts` is already in the repo.

## 2. Firebase

1. Create a Firebase project and add an Android app with package name `com.smartrestaurant.staff`.
2. Download `google-services.json` into `android/app/google-services.json` (this file is gitignored).
3. Enable **Cloud Messaging**.
4. Project settings → Service accounts → Generate a new private key. Put the values in `.env.local`:

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## 3. Environment

Copy `.env.example` → `.env.local` and set:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the Next.js app (production APK) |
| `CAPACITOR_SERVER_URL` | LAN URL while developing, e.g. `http://192.168.1.10:3000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Used to look up FCM tokens when dispatching alerts |
| `STAFF_ALERTS_SECRET` | Optional header for Database Webhooks |

Apply the token table:

```bash
npx supabase db push
```

or run `supabase/migrations/0034_staff_push_tokens.sql` on the project.

## 4. Android Studio / device

```bash
npx cap sync android
npx cap open android
```

On the device, grant notifications and (recommended) disable battery optimization for Restaurant OS so the alarm-style ring is not killed.

## 5. How ringing works

- **Foreground:** `@capacitor-community/native-audio` loops `public/sounds/ringtone.wav`. A full-screen Accept modal appears.
- **Background / screen off:** FCM delivers a high-priority data message. `StaffFirebaseMessagingService` starts `AlertRingService`, a foreground service that loops the same ringtone with `USAGE_ALARM` audio attributes and a full-screen incoming-call notification.
- **Accept:** stops Native Audio and the foreground service, then dismisses the modal. For Call Waiter it also claims the service request.

FCM payloads are data-only (no `notification` key) so Android always hands them to our service:

```json
{
  "type": "KITCHEN_READY",
  "tableNumber": "4",
  "title": "Table 4 Order is Ready",
  "body": "Pick up from the kitchen",
  "restaurantId": "...",
  "orderId": "..."
}
```

`CALL_WAITER` is the same shape, with `requestId` and `requestType` (`waiter` / `water` / `bill`).

## 6. Why `output: 'export'` is not enabled

Tutorials often add this to `next.config.js`:

```js
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
};
```

That is the right config for a static marketing site wrapped in Capacitor. It is the wrong config for Restaurant OS. Uncommenting `output: 'export'` in `next.config.mjs` will fail the production build (dynamic server usage). Leave it commented.
