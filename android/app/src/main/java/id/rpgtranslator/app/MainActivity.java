package id.rpgtranslator.app;

import android.os.Bundle;
import android.util.Log;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                getSharedPreferences(KeepAliveService.PREFS, MODE_PRIVATE).edit()
                    .putString(KeepAliveService.KEY_ERROR, Log.getStackTraceString(e))
                    .putLong(KeepAliveService.KEY_AT, System.currentTimeMillis())
                    .apply();
            } catch (Throwable ignored) {}
            if (prev != null) prev.uncaughtException(t, e);
        });
        registerPlugin(KeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                bridge.eval("globalThis.__rpgBack ? globalThis.__rpgBack() : false", value -> {
                    if (!"true".equals(value)) moveTaskToBack(true);
                });
            }
        });
    }
}
