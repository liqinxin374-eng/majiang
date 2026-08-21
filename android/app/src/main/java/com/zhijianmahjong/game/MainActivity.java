package com.zhijianmahjong.game;

import android.os.Bundle;
import android.webkit.WebView;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 当前入口仅用于本地调试包，开启网页调试以便用 ADB 定位手机端脚本错误。
        WebView.setWebContentsDebuggingEnabled(true);
        super.onCreate(savedInstanceState);
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enableImmersiveMode();
    }

    // 横屏对局隐藏系统状态与导航区域，避免左侧留白和顶部状态栏挤占牌桌。
    private void enableImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }
}
