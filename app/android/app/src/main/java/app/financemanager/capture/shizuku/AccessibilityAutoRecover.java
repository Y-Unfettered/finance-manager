package app.financemanager.capture.shizuku;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import app.financemanager.capture.accessibility.AccessibilityDiagnostics;


/**
 * 无障碍自动恢复管理器。
 *
 * 核心职责：
 * 1. 检查无障碍服务是否存活
 * 2. 如果不存活，通过 Shizuku 自动恢复
 * 3. 配合 MainActivity 实现"打开 APP 即恢复"的零感知体验
 * 4. 配合 WorkManager/AlarmManager 实现后台周期性检查（可选）
 *
 * 类比 GKD：GKD 通过 Shizuku + daemon(true) 长驻 UserService，
 * 在后台也能持续工作。这里采用相同的 Shizuku 长驻策略，
 * 但恢复逻辑更轻——只在需要时才启动，不占前台通知栏。
 *
 * 使用方式：
 *   AccessibilityAutoRecover.getInstance(context).checkAndRestore();
 *
 * 用户开关：
 *   通过 setEnabled(true/false) 控制是否启用自动恢复。
 *   默认开启。
 */
public class AccessibilityAutoRecover {

    private static final String TAG = "A11yAutoRecover";
    private static final String PREFS_NAME = "auto_recovery_prefs";
    private static final String KEY_ENABLED = "auto_recover_enabled";
    private static final String KEY_LAST_STATUS = "last_recovery_status";

    private static volatile AccessibilityAutoRecover sInstance;

    private final Context context;
    private boolean enabled;

    private AccessibilityAutoRecover(Context context) {
        this.context = context.getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        this.enabled = prefs.getBoolean(KEY_ENABLED, true);
    }

    public static AccessibilityAutoRecover getInstance(Context context) {
        if (sInstance == null) {
            synchronized (AccessibilityAutoRecover.class) {
                if (sInstance == null) {
                    sInstance = new AccessibilityAutoRecover(context);
                }
            }
        }
        return sInstance;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putBoolean(KEY_ENABLED, enabled).apply();
        Log.d(TAG, "自动恢复开关: " + (enabled ? "开启" : "关闭"));
    }

    /**
     * 核心方法：检查无障碍服务状态，不存活则自动恢复。
     *
     * @return 恢复结果对象
     */
    public RecoverResult checkAndRestore() {
        Log.d(TAG, "checkAndRestore 被调用, enabled=" + enabled + ", shizukuAvailable=" + ShizukuShell.isAvailable());

        if (!enabled) {
            return new RecoverResult(false, "自动恢复未开启");
        }

        // 检查无障碍服务是否已启用
        AccessibilityEnabler enabler = new AccessibilityEnabler(context);
        if (enabler.isEnabled()) {
            Log.d(TAG, "无障碍服务正常");
            return new RecoverResult(true, "无障碍服务正常");
        }

        // 无障碍服务被杀，尝试通过 Shizuku 恢复
        if (!ShizukuShell.isAvailable()) {
            Log.w(TAG, "Shizuku 不可用，无法自动恢复");
            return new RecoverResult(false, "Shizuku 不可用，请先授权 Shizuku");
        }

        try {
            boolean success = enabler.tryEnable();
            if (success) {
                Log.d(TAG, "无障碍服务已通过 Shizuku 自动恢复");
                AccessibilityDiagnostics.serviceConnected(context);
                persistStatus("recovered_at=" + System.currentTimeMillis());
                return new RecoverResult(true, "无障碍服务已自动恢复");
            } else {
                Log.e(TAG, "Shizuku 恢复失败");
                persistStatus("failed_at=" + System.currentTimeMillis());
                return new RecoverResult(false, "Shizuku 恢复失败，请手动在系统设置中开启");
            }
        } catch (Exception e) {
            Log.e(TAG, "恢复异常", e);
            persistStatus("error_at=" + System.currentTimeMillis());
            return new RecoverResult(false, "恢复异常: " + e.getMessage());
        }
    }

    /**
     * 一次性启动 Shizuku 长驻服务（开机或 APP 首次启动时调用）。
     * 这确保 UserService 的 daemon(true) 进程长期运行在 Shizuku 中。
     */
    public void ensureShizukuRunning() {
        if (ShizukuShell.isAvailable()) {
            // 触发一次 exec 来确保 UserService 已绑定（daemon 模式下次调用会复用）
            ShizukuShell.getInstance(context.getPackageName()).exec("echo 1");
            Log.d(TAG, "Shizuku UserService 已就绪（daemon 模式）");
        }
    }

    public static boolean isAvailable() {
        return ShizukuShell.isAvailable();
    }

    public static String getLastStatus(Context context) {
        try {
            return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getString(KEY_LAST_STATUS, "");
        } catch (Exception e) {
            return "";
        }
    }

    private void persistStatus(String status) {
        try {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().putString(KEY_LAST_STATUS, status).apply();
        } catch (Exception ignored) {}
    }

    /**
     * 恢复结果。
     */
    public static class RecoverResult {
        public final boolean success;
        public final String message;

        public RecoverResult(boolean success, String message) {
            this.success = success;
            this.message = message;
        }
    }
}