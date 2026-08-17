package app.financemanager.capture.shizuku;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * 开机自启广播接收器。
 *
 * 设备重启后，Android 会清空所有无障碍服务注册。Shizuku 也会重启。
 * 开机后需要恢复：
 * 1. 确保 Shizuku 的 daemon UserService 长驻
 * 2. 如果自动恢复开启，立即尝试恢复无障碍服务
 *
 * 类比 GKD：GKD 同样通过 BOOT_COMPLETED 恢复 Shizuku 连接和自动恢复逻辑。
 */
public class ShizukuBootReceiver extends BroadcastReceiver {

    private static final String TAG = "ShizukuBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                && !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)) {
            return;
        }

        Log.d(TAG, "收到 " + action + "，恢复自动记账");

        if (AccessibilityAutoRecover.isAvailable()) {
            AccessibilityAutoRecover.getInstance(context).ensureShizukuRunning();
            if (AccessibilityAutoRecover.getInstance(context).isEnabled()) {
                Log.d(TAG, "自动恢复已开启，立即恢复无障碍");
                AccessibilityAutoRecover.getInstance(context).checkAndRestore();
            }
        }
    }
}