package app.financemanager.local;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

import rikka.shizuku.Shizuku;
import rikka.shizuku.ShizukuProvider;

public class MainActivity extends BridgeActivity {
    private View privacyOverlay;
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ⚠️ Capacitor 8 的 BridgeActivity.onCreate() 内部已经调用了 this.load()
        // 创建 Bridge。必须在 super.onCreate() 之前注册插件，否则插件加不进去。
        try {
            this.registerPlugin(ClipboardReaderPlugin.class);
        } catch (Throwable e) {
            Log.e(TAG, "ClipboardReaderPlugin 注册失败: " + e.getClass().getSimpleName()
                    + ": " + e.getMessage(), e);
        }
        try {
            this.registerPlugin(PaymentCapturePlugin.class);
        } catch (Throwable e) {
            Log.e(TAG, "PaymentCapturePlugin 注册失败: " + e.getClass().getSimpleName()
                    + ": " + e.getMessage(), e);
        }

        super.onCreate(savedInstanceState);

        // 注册 Shizuku binder 接收器（sticky 模式：已授权则立即收到，未来授权也能收到）。
        // ShizukuProvider.onCreate() 已在此时调用 Shizuku.setContext()，所以现在可以注册接收器。
        // 同时主动请求 binder——因为 Shizuku manager 在扫描授权 app 时如果我们的进程不在，
        // 之后不会重发，需要主动请求一次。
        try {
            Shizuku.addBinderReceivedListenerSticky(new Shizuku.OnBinderReceivedListener() {
                @Override
                public void onBinderReceived() {
                    Log.d(TAG, "Shizuku binder received, ping=" + Shizuku.pingBinder());
                }
            });
            Shizuku.addBinderDeadListener(new Shizuku.OnBinderDeadListener() {
                @Override
                public void onBinderDead() {
                    Log.d(TAG, "Shizuku binder dead");
                }
            });
            // 主动请求 binder（Shizuku manager 之前可能没扫到我们，或 force-stop 后未重发）
            try {
                ShizukuProvider.requestBinderForNonProviderProcess(this);
                Log.d(TAG, "ShizukuProvider.requestBinderForNonProviderProcess called");
            } catch (Exception e) {
                Log.w(TAG, "requestBinderForNonProviderProcess 失败", e);
            }
            Log.d(TAG, "Shizuku listeners registered, ping=" + Shizuku.pingBinder());
        } catch (Exception e) {
            Log.e(TAG, "Shizuku listener 注册失败", e);
        }
        // 拦截 IME（系统输入法）insets，防止 WebView 内部缩小布局视口。
        // 即使 AndroidManifest 设置了 adjustNothing，WebView 仍会在收到 IME
        // insets 时自动缩小 layout viewport，导致页面被压缩、自定义数字键盘
        // 被推到上方。通过在 content view 层面剥离 IME insets，WebView 保持
        // 完整的布局视口高度，系统键盘仅作为覆盖层遮挡底部区域。
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                WindowInsetsCompat.Builder builder = new WindowInsetsCompat.Builder(windowInsets);
                builder.setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE);
                return builder.build();
            });
            ViewCompat.requestApplyInsets(contentView);
        }

        // 创建原生遮罩 View：白色背景 + 居中文字"财务经理"
        // 在窗口失去焦点时立即显示，先于系统截图。
        // 用户上滑进入任务中心时，窗口会先触发 onWindowFocusChanged(false)，
        // 系统**之后**才截图。比 onPause 早一个时序，确保截图前已遮罩。
        TextView overlay = new TextView(this);
        overlay.setText("财务经理");
        overlay.setTextColor(Color.parseColor("#9E9E9E"));
        overlay.setTextSize(20);
        overlay.setGravity(Gravity.CENTER);
        overlay.setBackgroundColor(Color.WHITE);
        overlay.setVisibility(View.GONE);
        addContentView(
            overlay,
            new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT
            )
        );
        privacyOverlay = overlay;

        // 从无障碍捕获拉起：checkPendingCaptureData() 在前端统一处理跳转记账页
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // 捕获数据的跳转由前端 checkPendingCaptureData() 统一处理（原 /capture-quick
        // hash 注入链路与 history 路由模式不匹配，从未生效，已删除）
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // 窗口失去焦点（用户上滑、通知栏下拉、切到其他 App）时立即显示遮罩。
        // 此时系统尚未截图，遮罩能先于截图生效。
        // 窗口重新获得焦点时隐藏遮罩。
        if (privacyOverlay != null) {
            privacyOverlay.setVisibility(hasFocus ? View.GONE : View.VISIBLE);
        }
    }

    /**
     * onResume 时主动触发 Bridge.onResume 通知插件。
     *
     * 虽然 BridgeActivity 本身会调用 super.onResume，但部分 Capacitor 版本对
     * 自定义插件（未通过 capacitor.plugins.json 注册的本地插件）的生命周期分
     * 发不一致。这里再显式调用一次，确保 ClipboardReaderPlugin.handleOnResume
     * 必定被触发。两次空触发不影响逻辑（有 lastSeenContent 去重保护）。
     */
    @Override
    public void onResume() {
        super.onResume();
        Log.d(TAG, "onResume: 触发 Bridge.onResume");
        if (getBridge() != null) {
            getBridge().onResume();
        }
        // 无障碍自动恢复（"打开 APP 即恢复"）：服务不存活且 Shizuku 可用时自动重新启用。
        // 延迟 1.5s：避开启动期与 Bridge 初始化抢主线程；Shizuku 不可用/未授权时静默跳过。
        findViewById(android.R.id.content).postDelayed(() -> {
            try {
                app.financemanager.capture.shizuku.AccessibilityAutoRecover
                        .getInstance(getApplicationContext())
                        .checkAndRestore();
            } catch (Exception e) {
                Log.w(TAG, "无障碍自动恢复异常", e);
            }
        }, 1500);
    }

    @Override
    public void onPause() {
        super.onPause();
        if (getBridge() != null) {
            getBridge().onPause();
        }
    }
}
