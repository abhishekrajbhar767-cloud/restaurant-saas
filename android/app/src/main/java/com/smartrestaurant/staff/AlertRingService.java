package com.smartrestaurant.staff;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class AlertRingService extends Service {
    public static final String CHANNEL_ID = "staff_alerts_alarm";
    public static final String ACTION_STOP = "com.smartrestaurant.staff.STOP_RING";
    public static final String ACTION_STOPPED = "com.smartrestaurant.staff.RING_STOPPED";
    private static final int NOTIFICATION_ID = 41001;

    private MediaPlayer player;
    private PowerManager.WakeLock wakeLock;
    private Vibrator vibrator;

    public static Intent buildIntent(
        Context context,
        String title,
        String body,
        String type,
        String tableNumber,
        String orderId,
        String requestId
    ) {
        Intent intent = new Intent(context, AlertRingService.class);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("type", type);
        intent.putExtra("tableNumber", tableNumber);
        intent.putExtra("orderId", orderId);
        intent.putExtra("requestId", requestId);
        return intent;
    }

    public static void start(
        Context context,
        String title,
        String body,
        String type,
        String tableNumber,
        String orderId,
        String requestId
    ) {
        try {
            ContextCompat.startForegroundService(
                context,
                buildIntent(context, title, body, type, tableNumber, orderId, requestId)
            );
        } catch (Exception ignored) {
            // Android 12+ can reject a background FGS start; high-priority FCM is the exemption.
        }
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, AlertRingService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

        createChannel();
        Notification notification = buildNotification(intent);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        acquireWakeLock();
        startVibration();
        startLooping();
        launchFullScreen(intent);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopLooping();
        stopVibration();
        releaseWakeLock();
        sendBroadcast(new Intent(ACTION_STOPPED).setPackage(getPackageName()));
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Staff alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Order ready and call waiter alarms");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 1000, 500, 1000 });
        channel.setSound(null, null);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                channel.setBypassDnd(true);
            }
        } catch (SecurityException ignored) {
            // DND access is optional; USAGE_ALARM still plays at alarm volume.
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(Intent intent) {
        String title = intent != null ? intent.getStringExtra("title") : null;
        String body = intent != null ? intent.getStringExtra("body") : null;
        String type = intent != null ? intent.getStringExtra("type") : null;
        String tableNumber = intent != null ? intent.getStringExtra("tableNumber") : null;
        String orderId = intent != null ? intent.getStringExtra("orderId") : null;
        String requestId = intent != null ? intent.getStringExtra("requestId") : null;
        if (title == null || title.isEmpty()) title = getString(R.string.alert_default_title);
        if (body == null || body.isEmpty()) body = getString(R.string.alert_default_body);

        Intent open = new Intent(this, AlertActivity.class);
        open.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
        );
        open.putExtra("title", title);
        open.putExtra("body", body);
        open.putExtra("type", type);
        open.putExtra("tableNumber", tableNumber);
        open.putExtra("orderId", orderId);
        open.putExtra("requestId", requestId);

        PendingIntent fullScreen = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stop = new Intent(this, AlertRingService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent dismiss = PendingIntent.getService(
            this,
            1,
            stop,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setSound(null)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .addAction(0, getString(R.string.alert_dismiss), dismiss)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private void launchFullScreen(Intent source) {
        Intent open = new Intent(this, AlertActivity.class);
        open.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
        );
        if (source != null && source.getExtras() != null) {
            open.putExtras(source.getExtras());
        }
        try {
            startActivity(open);
        } catch (Exception ignored) {
            // Android 10+ may block this; the full-screen notification intent still fires.
        }
    }

    private void startLooping() {
        if (player != null) return;
        try {
            player = new MediaPlayer();
            AssetFileDescriptor afd = getResources().openRawResourceFd(R.raw.ringtone);
            player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            player.setAudioAttributes(attrs);
            player.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            player.setLooping(true);
            player.setVolume(1f, 1f);
            player.prepare();
            player.start();
        } catch (Exception e) {
            stopLooping();
        }
    }

    private void stopLooping() {
        if (player == null) return;
        try {
            if (player.isPlaying()) player.stop();
        } catch (Exception ignored) {
            // already stopped
        }
        player.release();
        player = null;
    }

    private void startVibration() {
        vibrator = getVibrator();
        if (vibrator == null) return;
        long[] pattern = new long[] { 0, 1000, 500, 1000 };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void stopVibration() {
        if (vibrator != null) vibrator.cancel();
        vibrator = null;
    }

    private Vibrator getVibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager != null ? manager.getDefaultVibrator() : null;
        }
        return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    @SuppressWarnings("deprecation")
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(
            PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "RestaurantOS:AlertRing"
        );
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(10 * 60 * 1000L);
    }

    private void releaseWakeLock() {
        if (wakeLock == null) return;
        if (wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }
}
