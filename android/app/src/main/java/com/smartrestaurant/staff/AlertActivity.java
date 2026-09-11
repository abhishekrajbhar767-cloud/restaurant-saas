package com.smartrestaurant.staff;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

public class AlertActivity extends Activity {
    private final BroadcastReceiver stopReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            finish();
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        turnScreenOn();
        setContentView(R.layout.activity_alert);
        bind(getIntent());

        Button dismiss = findViewById(R.id.alert_dismiss);
        Button open = findViewById(R.id.alert_open);
        dismiss.setOnClickListener(v -> dismissAlert());
        open.setOnClickListener(v -> openApp());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bind(intent);
    }

    @Override
    protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(AlertRingService.ACTION_STOPPED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stopReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(stopReceiver, filter);
        }
    }

    @Override
    protected void onStop() {
        try {
            unregisterReceiver(stopReceiver);
        } catch (IllegalArgumentException ignored) {
            // already unregistered
        }
        super.onStop();
    }

    @SuppressWarnings("deprecation")
    private void turnScreenOn() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            KeyguardManager keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (keyguard != null) keyguard.requestDismissKeyguard(this, null);
        }
    }

    private void bind(Intent intent) {
        String type = extra(intent, "type");
        String title = extra(intent, "title");
        String body = extra(intent, "body");
        String tableNumber = extra(intent, "tableNumber");

        boolean kitchen = "KITCHEN_READY".equals(type);
        TextView pulse = findViewById(R.id.alert_pulse);
        TextView kicker = findViewById(R.id.alert_kicker);
        TextView titleView = findViewById(R.id.alert_title);
        TextView bodyView = findViewById(R.id.alert_body);
        TextView tableView = findViewById(R.id.alert_table);

        pulse.setText(kitchen ? R.string.alert_pulse_ready : R.string.alert_pulse_call);
        kicker.setText(kitchen ? R.string.alert_kicker_kitchen : R.string.alert_kicker_floor);
        titleView.setText(title.isEmpty() ? getString(R.string.alert_default_title) : title);
        bodyView.setText(body.isEmpty() ? getString(R.string.alert_default_body) : body);

        if (tableNumber.isEmpty()) {
            tableView.setVisibility(View.GONE);
        } else {
            tableView.setVisibility(View.VISIBLE);
            tableView.setText(getString(R.string.alert_table, tableNumber));
        }
    }

    private void dismissAlert() {
        AlertRingService.stop(this);
        finish();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        dismissAlert();
    }

    private void openApp() {
        AlertRingService.stop(this);
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        ContextCompat.startActivity(this, open, null);
        finish();
    }

    private static String extra(Intent intent, String key) {
        if (intent == null) return "";
        String value = intent.getStringExtra(key);
        return value == null ? "" : value;
    }
}
