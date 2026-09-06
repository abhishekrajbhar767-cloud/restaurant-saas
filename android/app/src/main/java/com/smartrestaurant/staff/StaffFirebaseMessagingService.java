package com.smartrestaurant.staff;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class StaffFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        if (("KITCHEN_READY".equals(type) || "CALL_WAITER".equals(type)) && !MainActivity.inForeground) {
            AlertRingService.start(
                this,
                first(data.get("title"), "Staff alert"),
                first(data.get("body"), "Incoming floor alert"),
                type,
                first(data.get("tableNumber"), ""),
                data.get("orderId"),
                data.get("requestId")
            );
        }
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        PushNotificationsPlugin.onNewToken(token);
    }

    private static String first(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
