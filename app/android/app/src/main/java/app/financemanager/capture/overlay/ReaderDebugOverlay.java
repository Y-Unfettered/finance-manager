package app.financemanager.capture.overlay;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

import app.financemanager.capture.accessibility.PaymentAccessibilityService;
import app.financemanager.local.MainActivity;
import app.financemanager.local.PaymentCapturePlugin;

/**
 * 「读屏测试」悬浮按钮（诊断工具）。
 *
 * 显示在所有屏幕之上（TYPE_APPLICATION_OVERLAY），可垂直拖动、点按触发一次
 * 无障碍节点树抓取：抓取结果交给 PaymentCapturePlugin 暂存并拉起结果页；
 * 拉起被拦（MIUI 后台启动限制）时退化为复制到剪贴板 + Toast。
 *
 * 纯只读：不点击、不输入、不修改任何目标 APP 的内容。
 * 开关状态持久化在 capture_prefs.reader_debug_enabled，由 PaymentCapturePlugin.load() 恢复。
 */
public final class ReaderDebugOverlay {

    private static final String TAG = "ReaderDebugOverlay";
    private static final String PREFS_NAME = "capture_prefs";
    private static final String KEY_ENABLED = "reader_debug_enabled";

    private static final Object LOCK = new Object();
    private static View buttonView;
    private static boolean showing = false;

    private ReaderDebugOverlay() {}

    public static boolean isEnabled(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getBoolean(KEY_ENABLED, false);
        } catch (Exception e) {
            return false;
        }
    }

    /** 显示/隐藏悬浮按钮（enabled=true 且已授予悬浮窗权限时显示）。返回实际显示状态。 */
    public static boolean apply(Context context, boolean enabled) {
        context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_ENABLED, enabled).apply();
        if (enabled && android.provider.Settings.canDrawOverlays(context)) {
            show(context.getApplicationContext());
            return true;
        }
        hide(context.getApplicationContext());
        return false;
    }

    /** APP 启动时按持久化开关恢复显示。 */
    public static void restoreIfNeeded(Context context) {
        if (isEnabled(context) && android.provider.Settings.canDrawOverlays(context)) {
            show(context.getApplicationContext());
        }
    }

    private static void show(Context context) {
        synchronized (LOCK) {
            if (showing) return;
            try {
                WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
                int size = dp(context, 52);
                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                        size, size,
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                        PixelFormat.TRANSLUCENT);
                params.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
                params.x = dp(context, 4);
                params.y = 0;

                TextView button = buildButton(context, size);
                button.setOnTouchListener(createTouchListener(context, wm, button, params));
                wm.addView(button, params);
                buttonView = button;
                showing = true;
                Log.d(TAG, "读屏测试按钮已显示");
            } catch (Exception e) {
                Log.w(TAG, "显示读屏测试按钮失败", e);
                showing = false;
            }
        }
    }

    private static void hide(Context context) {
        synchronized (LOCK) {
            if (!showing || buttonView == null) return;
            try {
                WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
                wm.removeView(buttonView);
            } catch (Exception e) {
                Log.w(TAG, "移除读屏测试按钮失败", e);
            } finally {
                buttonView = null;
                showing = false;
                Log.d(TAG, "读屏测试按钮已隐藏");
            }
        }
    }

    private static TextView buildButton(Context context, int size) {
        TextView button = new TextView(context);
        button.setText("读屏");
        button.setTextColor(Color.WHITE);
        button.setTextSize(13);
        button.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.argb(190, 23, 107, 93)); // 品牌绿 90% 不透明
        bg.setStroke(dp(context, 1), Color.argb(120, 255, 255, 255));
        button.setBackground(bg);
        // 点击动作：touch listener 的 UP 分支在位移小于 touchSlop 时 performClick() 走到这里
        button.setOnClickListener(v -> onButtonClicked(context));
        return button;
    }

    /**
     * 触摸：MOVE 更新垂直位置（贴右缘拖动）；UP 时若位移在 touchSlop 内判为点按 → 触发抓取。
     */
    private static View.OnTouchListener createTouchListener(
            Context context, WindowManager wm, View button, WindowManager.LayoutParams params) {
        final float[] down = new float[2];
        final int[] startParamsY = {0};
        final boolean[] dragged = {false};
        int touchSlop = dp(context, 8);
        return (v, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    down[0] = event.getRawY();
                    startParamsY[0] = params.y;
                    dragged[0] = false;
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    float dy = event.getRawY() - down[0];
                    if (Math.abs(dy) > touchSlop) dragged[0] = true;
                    params.y = startParamsY[0] - (int) dy; // gravity=CENTER_VERTICAL：向上拖 y 增
                    try {
                        wm.updateViewLayout(button, params);
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (!dragged[0]) {
                        v.performClick();
                    }
                    return true;
                default:
                    return false;
            }
        };
    }

    /** 点按动作：抓取当前窗口节点树 → 暂存 → 拉起结果页；拉起异常时复制剪贴板兜底。 */
    static void onButtonClicked(Context context) {
        String tree = PaymentAccessibilityService.captureActiveWindowTree();
        if (tree == null || tree.isEmpty()) {
            toast(context, "读屏失败：无障碍服务未连接，请先在系统设置中开启");
            return;
        }
        PaymentCapturePlugin.setPendingScreenDump(tree);
        Log.d("ReaderDebugOverlay", "已抓取节点树 " + tree.length() + " 字符，拉起结果页");
        try {
            android.content.Intent intent = new android.content.Intent(context, MainActivity.class);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("pendingScreenDump", true);
            context.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "拉起结果页失败，退化为复制剪贴板", e);
            copyToClipboard(context, tree);
            toast(context, "已抓取并复制到剪贴板（拉起页面被系统拦截）");
        }
    }

    private static void copyToClipboard(Context context, String text) {
        try {
            android.content.ClipboardManager cm =
                    (android.content.ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(android.content.ClipData.newPlainText("screen-dump", text));
        } catch (Exception e) {
            Log.w(TAG, "复制剪贴板失败", e);
        }
    }

    private static void toast(Context context, String msg) {
        try {
            android.widget.Toast.makeText(context, msg, android.widget.Toast.LENGTH_LONG).show();
        } catch (Exception ignored) {
        }
    }

    private static int dp(Context context, int v) {
        return Math.round(v * context.getResources().getDisplayMetrics().density);
    }
}
