package app.financemanager.local;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/**
 * 悬浮窗记账 Activity。
 *
 * 在微信/支付宝等 APP 上层以透明对话框形式弹出，内部是完整的 Vue 记账表单
 * （分类网格、账户选择、金额编辑），复用 MainActivity 的 bridge 和 Room 数据。
 *
 * 启动方式：
 *   Intent i = new Intent(ctx, OverlayQuickEntryActivity.class);
 *   i.putExtra("pendingId", captureQueueId);
 *   i.addFlags(FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP);
 *   ctx.startActivity(i);
 */
public class OverlayQuickEntryActivity extends BridgeActivity {
    private static final String TAG = "OverlayQuickEntry";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            this.registerPlugin(PaymentCapturePlugin.class);
        } catch (Throwable e) {
            Log.e(TAG, "PaymentCapturePlugin 注册失败", e);
        }

        super.onCreate(savedInstanceState);

        // 透明背景 + 不挡住下层 APP 的触摸
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);

        Intent intent = getIntent();
        long pendingId = intent != null ? intent.getLongExtra("pendingId", -1) : -1;
        Log.d(TAG, "启动 OverlayQuickEntry pendingId=" + pendingId);

        // Vue 应用启动需要时间，分次尝试跳转
        final long pid = pendingId;
        for (int delay : new int[] {1200, 2500, 4000}) {
            getWindow().getDecorView().postDelayed(() -> {
                try {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = "if(window.location.hash.indexOf('capture-quick')<0){window.location.hash='#/capture-quick?pendingId=" + pid + "';}";
                        getBridge().getWebView().evaluateJavascript(js, null);
                        Log.d(TAG, "尝试跳转 capture-quick pendingId=" + pid);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "跳转 capture-quick 失败", e);
                }
            }, delay);
        }
    }

    @Override
    public void onBackPressed() {
        // 用户按返回键 = 忽略这笔，直接 finish
        super.onBackPressed();
        finish();
    }
}
