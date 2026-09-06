package com.smartrestaurant.staff;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AlertRing")
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
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            ret.put("requested", false);
            call.resolve(ret);
            return;
        }

        PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        String pkg = getContext().getPackageName();
        if (pm != null && pm.isIgnoringBatteryOptimizations(pkg)) {
            ret.put("requested", false);
            call.resolve(ret);
            return;
        }

        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + pkg));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        ret.put("requested", true);
        call.resolve(ret);
    }
}
