import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

function firebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
  );
}

function getFirebaseApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    throw new Error('Firebase Admin credentials are not set.');
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

export async function sendStaffPush(tokens: string[], data: Record<string, string>): Promise<number> {
  if (tokens.length === 0) return 0;
  if (!firebaseConfigured()) {
    console.warn('FCM skipped — FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not set.');
    return 0;
  }

  const messaging = getMessaging(getFirebaseApp());
  const response = await messaging.sendEachForMulticast({
    tokens,
    data,
    android: {
      priority: 'high',
      ttl: 0,
    },
  });

  if (response.failureCount > 0) {
    const reasons = response.responses
      .filter((result) => !result.success)
      .map((result) => result.error?.message)
      .filter(Boolean)
      .slice(0, 5);
    console.warn(`FCM delivered ${response.successCount}/${tokens.length}`, reasons);
  }

  return response.successCount;
}
