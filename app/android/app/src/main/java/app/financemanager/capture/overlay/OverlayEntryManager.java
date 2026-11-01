package app.financemanager.capture.overlay;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import app.financemanager.local.PaymentCapturePlugin;
import app.financemanager.local.capture.CaptureQueueEntity;

/**
 * 原生悬浮窗管理器。
 *
 * 在微信/支付宝等支付 APP 上层直接弹出底部记账卡片。
 * 不加载 WebView，纯原生 View，毫秒级显示。
 *
 * 一期 MVP：
 *  - 显示金额 + 商户 + 来源标签
 *  - 三个按钮：[用默认分类记一笔] [改分类] [忽略]
 *  - 点"记一笔"：通过 bridge 把事件抛给前端，前端用规则推荐的账户/分类直接入账
 *  - 点"改分类"：收起悬浮窗，把 MainActivity 拉到前台，弹完整 WebView 弹窗
 *  - 点"忽略"：从队列删除记录，收起悬浮窗
 */
public class OverlayEntryManager {

    private static final String TAG = "OverlayEntry";
    private static volatile OverlayEntryManager INSTANCE;

    private final Context appContext;
    private final WindowManager windowManager;
    private View overlayView;
    private CaptureQueueEntity currentEntity;

    private OverlayEntryManager(Context context) {
        this.appContext = context.getApplicationContext();
        this.windowManager = (WindowManager) appContext.getSystemService(Context.WINDOW_SERVICE);
    }

    public static OverlayEntryManager getInstance(Context context) {
        if (INSTANCE == null) {
            synchronized (OverlayEntryManager.class) {
                if (INSTANCE == null) {
                    INSTANCE = new OverlayEntryManager(context);
                }
            }
        }
        return INSTANCE;
    }

    /** 检查是否有悬浮窗权限。 */
    public boolean canDrawOverlay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(appContext);
        }
        return true;
    }

    /** 跳转到悬浮窗权限设置页。 */
    public void openOverlaySettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + appContext.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            appContext.startActivity(intent);
        }
    }

    /** 当前是否已有悬浮窗在显示。 */
    public boolean isShowing() {
        return overlayView != null;
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    /**
     * 尝试显示悬浮窗。任意线程可调用，内部 post 到主线程执行。
     * @return true 表示已接受请求（将在主线程弹出）；false 表示权限不足或已有悬浮窗在显示
     */
    public synchronized boolean maybeShowOverlay(CaptureQueueEntity entity) {
        android.util.Log.d("OverlayEntry", "maybeShowOverlay called, entity=" + (entity != null ? entity.getId() : "null"));
        if (entity == null) return false;
        if (overlayView != null) return false;
        if (!canDrawOverlay()) {
            android.util.Log.w("OverlayEntry", "无悬浮窗权限");
            return false;
        }
        currentEntity = entity;
        final CaptureQueueEntity e = entity;
        mainHandler.post(() -> {
            try {
                View view = buildView(e);
                WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT,
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                        PixelFormat.TRANSLUCENT);
                lp.gravity = Gravity.BOTTOM;
                lp.y = 0;
                windowManager.addView(view, lp);
                overlayView = view;
                android.util.Log.d("OverlayEntry", "悬浮窗已添加");
            } catch (Exception ex) {
                currentEntity = null;
                android.util.Log.e("OverlayEntry", "addView 失败", ex);
            }
        });
        return true;
    }

    /** 收起悬浮窗（不入账、不删除）。 */
    public synchronized void dismiss() {
        mainHandler.post(this::removeViewQuietly);
        currentEntity = null;
    }

    /** 原生收到前端入账完成回调后调用：Toast + 收起。 */
    public synchronized void onCommitDone(boolean success, String message) {
        mainHandler.post(() -> {
            removeViewQuietly();
            currentEntity = null;
            try {
                Toast.makeText(appContext,
                        success ? ("已记账 " + message) : ("入账失败: " + message),
                        Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) {
            }
        });
    }

    // ====================================================================
    // 内部构建 View
    // ====================================================================

    private View buildView(CaptureQueueEntity entity) {
        float density = appContext.getResources().getDisplayMetrics().density;
        int padH = dp(16);
        int padV = dp(12);

        LinearLayout root = new LinearLayout(appContext);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(padH, padV, padH, padV + dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#FFFFFF"));
        bg.setCornerRadius(dp(20));
        root.setBackground(bg);
        root.setElevation(dp(8));
        root.setClickable(true);
        root.setOnTouchListener((v, ev) -> {
            if (ev.getAction() == android.view.MotionEvent.ACTION_UP) {
                Log.d(TAG, "root touch up at (" + ev.getX() + "," + ev.getY() + ")");
            }
            return false;
        });

        // 第一行：金额 + 商户
        TextView amount = new TextView(appContext);
        long minor = entity.getAmountMinor() != null ? entity.getAmountMinor() : 0L;
        amount.setText("¥" + (minor / 100.0));
        amount.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
        amount.setTextColor(Color.parseColor("#111827"));
        amount.setTypeface(amount.getTypeface(), android.graphics.Typeface.BOLD);

        TextView merchant = new TextView(appContext);
        merchant.setText(entity.getMerchant() != null && !entity.getMerchant().isEmpty()
                ? entity.getMerchant() : (entity.getSourceName() != null ? entity.getSourceName() : "支付"));
        merchant.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        merchant.setTextColor(Color.parseColor("#6B7280"));

        LinearLayout topRow = new LinearLayout(appContext);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.BOTTOM);
        topRow.addView(amount);
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        mp.leftMargin = dp(12);
        topRow.addView(merchant, mp);
        root.addView(topRow);

        // 从缓存读分类和账户
        android.content.SharedPreferences sp = appContext.getSharedPreferences("overlay_cache", android.content.Context.MODE_PRIVATE);
        String catsJson = sp.getString("categories", "[]");
        String accsJson = sp.getString("accounts", "[]");
        final String[] selectedCategoryId = {null};
        final String[] selectedAccountId = {null};

        // 分类标签行
        root.addView(makeOptionRow("分类", catsJson, selectedCategoryId, true));
        // 账户标签行
        root.addView(makeOptionRow("账户", accsJson, selectedAccountId, false));

        // 按钮组
        LinearLayout buttons = new LinearLayout(appContext);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setPadding(0, dp(12), 0, 0);

        Button btnDismiss = makeButton("忽略", Color.parseColor("#F3F4F6"),
                Color.parseColor("#374151"), v -> {
            PaymentCapturePlugin.notifyOverlayDismiss(currentEntity);
            dismiss();
        });
        buttons.addView(btnDismiss, new LinearLayout.LayoutParams(0, dp(46), 1f));

        Button btnConfirm = makeButton("✓ 记一笔", Color.parseColor("#2563EB"),
                Color.WHITE, v -> {
            Log.d(TAG, "记一笔按钮被点击");
            v.setEnabled(false);
            // 把 pending 数据存到 SharedPreferences
            android.content.SharedPreferences.Editor ed = sp.edit();
            ed.putLong("pending_amount_minor", currentEntity.getAmountMinor() != null ? currentEntity.getAmountMinor() : 0L);
            ed.putString("pending_merchant", currentEntity.getMerchant() != null ? currentEntity.getMerchant() : "");
            ed.putString("pending_occurred_at", currentEntity.getOccurredAt() != null ? currentEntity.getOccurredAt() : "");
            ed.putString("pending_category_id", selectedCategoryId[0] != null ? selectedCategoryId[0] : "");
            ed.putString("pending_account_id", selectedAccountId[0] != null ? selectedAccountId[0] : "");
            ed.apply();
            // 从捕获队列删除
            if (currentEntity != null && currentEntity.getId() > 0) {
                try {
                    app.financemanager.local.capture.CaptureQueueDatabase
                            .getInstance(appContext).captureQueueDao()
                            .delete(currentEntity.getId());
                } catch (Exception ignored) {}
            }
            dismiss();
            // 拉起 MainActivity，自动入账
            Intent intent = new Intent(appContext, app.financemanager.local.MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra("pendingOverlayCommit", true);
            appContext.startActivity(intent);
        });
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, dp(46), 2.5f);
        cp.leftMargin = dp(8);
        buttons.addView(btnConfirm, cp);

        root.addView(buttons);
        return root;
    }

    /** 构建一行横向标签选择器（分类或账户）。 */
    private View makeOptionRow(String label, String json, final String[] selectedId, boolean isCategory) {
        LinearLayout row = new LinearLayout(appContext);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(10), 0, 0);

        TextView labelView = new TextView(appContext);
        labelView.setText(label);
        labelView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        labelView.setTextColor(Color.parseColor("#9CA3AF"));
        row.addView(labelView);

        HorizontalScrollView scroll = new HorizontalScrollView(appContext);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout chips = new LinearLayout(appContext);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        chips.setPadding(dp(8), 0, 0, 0);

        try {
            org.json.JSONArray arr = new org.json.JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject obj = arr.getJSONObject(i);
                final String id = obj.getString("id");
                String name = obj.getString("name");
                TextView chip = new TextView(appContext);
                chip.setText(name);
                chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
                chip.setPadding(dp(12), dp(6), dp(12), dp(6));
                final TextView chipRef = chip;
                // 默认选中第一个
                if (i == 0) {
                    selectedId[0] = id;
                    chip.setBackground(chipBg(true));
                    chip.setTextColor(Color.WHITE);
                } else {
                    chip.setBackground(chipBg(false));
                    chip.setTextColor(Color.parseColor("#374151"));
                }
                chip.setOnClickListener(v -> {
                    selectedId[0] = id;
                    // 重置所有 chip 样式
                    for (int j = 0; j < chips.getChildCount(); j++) {
                        TextView c = (TextView) chips.getChildAt(j);
                        boolean sel = (c == chipRef);
                        c.setBackground(chipBg(sel));
                        c.setTextColor(sel ? Color.WHITE : Color.parseColor("#374151"));
                    }
                });
                chips.addView(chip);
            }
        } catch (Exception e) {
            android.util.Log.w("OverlayEntry", "解析 " + label + " 失败: " + e.getMessage());
        }
        scroll.addView(chips);
        row.addView(scroll, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private GradientDrawable chipBg(boolean selected) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(selected ? Color.parseColor("#2563EB") : Color.parseColor("#F3F4F6"));
        g.setCornerRadius(dp(20));
        return g;
    }

    private Button makeButton(String text, int bgColor, int textColor, View.OnClickListener listener) {
        Button b = new Button(appContext);
        b.setText(text);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTextColor(textColor);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setCornerRadius(dp(12));
        b.setBackground(bg);
        b.setAllCaps(false);
        b.setOnClickListener(listener);
        return b;
    }

    /** 把 MainActivity 拉到前台（用于"改分类"按钮）。 */
    private void bringMainActivityToFront(CaptureQueueEntity e) {
        try {
            Intent intent = appContext.getPackageManager()
                    .getLaunchIntentForPackage(appContext.getPackageName());
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                // 携带 pendingId，MainActivity 会跳转到 /capture-quick 记账表单
                intent.putExtra("pendingId", e.getId());
                appContext.startActivity(intent);
            }
        } catch (Exception ignored) {
        }
    }

    private void removeViewQuietly() {
        if (overlayView != null) {
            try {
                windowManager.removeView(overlayView);
            } catch (Exception ignored) {
            }
            overlayView = null;
        }
    }

    private int dp(int v) {
        return (int) (v * appContext.getResources().getDisplayMetrics().density + 0.5f);
    }
}
