package com.smartrestaurant.staff;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import java.util.concurrent.atomic.AtomicBoolean;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "AlertRing",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
            }
        )
    }
)
public class AlertRingPlugin extends Plugin {

    // A cached fix older than this proves nothing about where the person is
    // standing right now, so it is discarded in favour of a live one.
    private static final long MAX_FIX_AGE_MS = 60_000L;
    private static final long FIX_TIMEOUT_MS = 15_000L;

    @PluginMethod
    public void start(PluginCall call) {
        AlertRingService.start(
            getContext(),
            call.getString("title", "Staff alert"),
            call.getString("body", "Incoming floor alert"),
            call.getString("type", "KITCHEN_READY"),
            call.getString("tableNumber", ""),
            call.getString("orderId"),
            call.getString("requestId")
        );
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        AlertRingService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void checkAlertPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("overlay", hasOverlayPermission());
        ret.put("batteryOptimizationsIgnored", isIgnoringBatteryOptimizations());
        ret.put("fullScreenIntent", canUseFullScreenIntent());
        ret.put("location", hasLocationPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = isIgnoringBatteryOptimizations();
        boolean requested = !granted && openBatteryOptimizationSettings();
        ret.put("granted", granted);
        ret.put("requested", requested);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = hasOverlayPermission();
        boolean requested = !granted && openOverlaySettings();
        ret.put("granted", granted);
        ret.put("requested", requested);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestFullScreenIntentPermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = canUseFullScreenIntent();
        boolean requested = !granted && openFullScreenIntentSettings();
        ret.put("granted", granted);
        ret.put("requested", requested);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestCriticalPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        if (!isIgnoringBatteryOptimizations() && openBatteryOptimizationSettings()) {
            ret.put("opened", "battery");
            call.resolve(ret);
            return;
        }
        if (!hasOverlayPermission() && openOverlaySettings()) {
            ret.put("opened", "overlay");
            call.resolve(ret);
            return;
        }
        if (!canUseFullScreenIntent() && openFullScreenIntentSettings()) {
            ret.put("opened", "fullScreenIntent");
            call.resolve(ret);
            return;
        }
        ret.put("opened", "");
        call.resolve(ret);
    }

    // The permanently-denied escape hatch. Once Android stops showing a
    // runtime prompt (two denials, or "Don't ask again" on an OEM skin), the
    // only way back is the app's own details page in system Settings.
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            ret.put("opened", true);
        } catch (Exception e) {
            // Some heavily-skinned ROMs block or rename this screen. Report it
            // rather than crashing so the UI can fall back to written steps.
            ret.put("opened", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestLocationPermissions(PluginCall call) {
        if (hasLocationPermission()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("location", call, "locationPermsCallback");
    }

    /**
     * A location fix straight from the platform, carrying whether Android
     * considers it mocked. The WebView's navigator.geolocation cannot answer
     * that question — a fake GPS app looks identical through it — so
     * clock-in reads the fix here instead and refuses a mocked one.
     */
    @PluginMethod
    public void getVerifiedLocation(PluginCall call) {
        if (!hasLocationPermission()) {
            call.reject("LOCATION_PERMISSION_DENIED");
            return;
        }

        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            call.reject("LOCATION_UNAVAILABLE");
            return;
        }

        Location freshest = null;
        try {
            for (String provider : manager.getProviders(true)) {
                Location candidate = manager.getLastKnownLocation(provider);
                if (candidate == null) continue;
                if (freshest == null || candidate.getTime() > freshest.getTime()) freshest = candidate;
            }
        } catch (SecurityException e) {
            call.reject("LOCATION_PERMISSION_DENIED");
            return;
        }

        if (freshest != null && System.currentTimeMillis() - freshest.getTime() <= MAX_FIX_AGE_MS) {
            call.resolve(describeLocation(freshest));
            return;
        }

        requestSingleFix(call, manager);
    }

    private void requestSingleFix(PluginCall call, LocationManager manager) {
        Handler handler = new Handler(Looper.getMainLooper());
        AtomicBoolean settled = new AtomicBoolean(false);

        LocationListener listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if (!settled.compareAndSet(false, true)) return;
                handler.removeCallbacksAndMessages(null);
                removeUpdatesQuietly(manager, this);
                call.resolve(describeLocation(location));
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {}

            @Override
            public void onProviderEnabled(String provider) {}

            @Override
            public void onProviderDisabled(String provider) {}
        };

        handler.post(() -> {
            String provider = manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                ? LocationManager.GPS_PROVIDER
                : LocationManager.NETWORK_PROVIDER;

            try {
                manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper());
            } catch (SecurityException e) {
                if (settled.compareAndSet(false, true)) call.reject("LOCATION_PERMISSION_DENIED");
                return;
            } catch (IllegalArgumentException e) {
                if (settled.compareAndSet(false, true)) call.reject("LOCATION_UNAVAILABLE");
                return;
            }

            handler.postDelayed(() -> {
                if (!settled.compareAndSet(false, true)) return;
                removeUpdatesQuietly(manager, listener);
                call.reject("LOCATION_TIMEOUT");
            }, FIX_TIMEOUT_MS);
        });
    }

    private void removeUpdatesQuietly(LocationManager manager, LocationListener listener) {
        try {
            manager.removeUpdates(listener);
        } catch (SecurityException ignored) {
            // Permission revoked mid-request; nothing left to clean up.
        }
    }

    private JSObject describeLocation(Location location) {
        JSObject ret = new JSObject();
        ret.put("latitude", location.getLatitude());
        ret.put("longitude", location.getLongitude());
        ret.put("accuracy", location.getAccuracy());
        ret.put("isMock", isMockLocation(location));
        return ret;
    }

    private boolean isMockLocation(Location location) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return location.isMock();
        return location.isFromMockProvider();
    }

    @PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasLocationPermission());
        call.resolve(ret);
    }

    private boolean hasLocationPermission() {
        // A geofence must not be treated as ready when Android has only
        // granted approximate (coarse) location. Capacitor's alias contains
        // both permissions, but checking FINE explicitly also keeps this
        // strict on OEM builds that report a partially-granted alias.
        return getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasOverlayPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(getContext());
    }

    private boolean isIgnoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private boolean canUseFullScreenIntent() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        return manager != null && manager.canUseFullScreenIntent();
    }

    private boolean openBatteryOptimizationSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        try {
            Intent directRequest = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            directRequest.setData(Uri.parse("package:" + getContext().getPackageName()));
            directRequest.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(directRequest);
            return true;
        } catch (Exception ignored) {
            // MIUI/FuntouchOS and a few other ROMs do not expose the direct
            // per-app request activity. Fall back to the battery allow-list.
        }

        try {
            Intent batteryList = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            batteryList.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(batteryList);
            return true;
        } catch (Exception ignored) {
            // Last resort: the app details page still gives the user a route
            // to the OEM-specific battery/background-use controls.
        }

        try {
            Intent appDetails = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            appDetails.setData(Uri.parse("package:" + getContext().getPackageName()));
            appDetails.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(appDetails);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean openOverlaySettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        return true;
    }

    private boolean openFullScreenIntentSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false;
        Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        return true;
    }
}
