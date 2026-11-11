package id.rpgtranslator.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
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
