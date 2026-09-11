package com.smartrestaurant.staff;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
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

    @PermissionCallback
    private void locationPermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasLocationPermission());
        call.resolve(ret);
    }

    private boolean hasLocationPermission() {
        if (getPermissionState("location") == PermissionState.GRANTED) return true;
        return getContext().checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
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
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        return true;
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
