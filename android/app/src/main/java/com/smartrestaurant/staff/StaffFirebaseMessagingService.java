package com.smartrestaurant.staff;

import android.content.Context;
import android.os.PowerManager;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class StaffFirebaseMessagingService extends FirebaseMessagingService {
    private static final long WAKE_MS = 10_000L;
    private PowerManager.WakeLock incomingWakeLock;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        if ("KITCHEN_READY".equals(type) || "CALL_WAITER".equals(type)) {
            acquireIncomingWakeLock();
            if (!MainActivity.inForeground) {
                try {
                    ContextCompat.startForegroundService(
                        this,
                        AlertRingService.buildIntent(
                            this,
                            first(data.get("title"), "Staff alert"),
                            first(data.get("body"), "Incoming floor alert"),
                            type,
                            first(data.get("tableNumber"), ""),
                            data.get("orderId"),
                            data.get("requestId")
                        )
                    );
                } catch (Exception ignored) {
                    // High-priority FCM is the usual exemption; skip if the OEM still blocks FGS.
                }
            }
        }
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        PushNotificationsPlugin.onNewToken(token);
    }

    @SuppressWarnings("deprecation")
    private void acquireIncomingWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        if (incomingWakeLock != null && incomingWakeLock.isHeld()) {
            incomingWakeLock.release();
        }
        incomingWakeLock = pm.newWakeLock(
            PowerManager.FULL_WAKE_LOCK
                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                | PowerManager.ON_AFTER_RELEASE,
            "RestaurantOS:IncomingAlert"
        );
        incomingWakeLock.setReferenceCounted(false);
        incomingWakeLock.acquire(WAKE_MS);
    }

    private static String first(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
