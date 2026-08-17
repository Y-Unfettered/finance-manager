package app.financemanager.capture.shizuku;

import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.util.Log;

/**
 * 无障碍服务自动启用工具。
 *
 * 通过 Shizuku 执行 ADB 命令自动启用无障碍服务，绕过小米等定制 ROM
 * 对无障碍权限的严格限制。
 *
 * 参考：AutoAccounting 项目的 OcrTools.kt
 *
 * 原理：
 * - ADB 命令 "settings put secure enabled_accessibility_services" 直接设置无障碍列表
 * - ADB 命令 "settings put secure accessibility_enabled 1" 开启无障碍总开关
 * - 这两条命令在普通应用权限下不可用，但通过 Shizuku 以 shell 身份可以执行
 */
public class AccessibilityEnabler {

    private static final String TAG = "AccessibilityEnabler";

    private static final String ACCESSIBILITY_SERVICE_CLASS =
            "app.financemanager.capture.accessibility.PaymentAccessibilityService";

    private final Context context;

    public AccessibilityEnabler(Context context) {
        this.context = context.getApplicationContext();
    }

    /**
     * 获取无障碍服务的组件名。
     */
    public String getComponentName() {
        return context.getPackageName() + "/" + ACCESSIBILITY_SERVICE_CLASS;
    }

    /**
     * 尝试通过 Shizuku 自动启用无障碍服务。
     *
     * @return true 表示操作成功（包括已启用的情况），false 表示失败
     */
    public boolean tryEnable() {
        Log.d(TAG, "尝试通过 Shizuku 启用无障碍服务");

        if (!ShizukuShell.isAvailable()) {
            Log.w(TAG, "Shizuku 不可用，无法自动启用");
            return false;
        }

        String componentName = getComponentName();

        try {
            ShizukuShell shell = new ShizukuShell(context.getPackageName());

            // 获取当前已启用的无障碍服务列表
            String cmdGet = "settings get secure enabled_accessibility_services";
            String current = shell.exec(cmdGet).trim();
            if (current.equals("null") || current.isEmpty()) {
                current = "";
            }

            Log.d(TAG, "当前已启用无障碍服务: " + current);

            // 如果已经启用，直接返回成功
            if (current.contains(componentName)) {
                Log.d(TAG, "无障碍服务已启用");
                shell.release();
                return true;
            }

            // 添加到列表
            String newList = current.isEmpty() ? componentName : (current + ":" + componentName);

            String result1 = shell.exec("settings put secure enabled_accessibility_services " + newList);
            String result2 = shell.exec("settings put secure accessibility_enabled 1");

            boolean success = result1 != null && result2 != null;
            Log.d(TAG, "启用无障碍服务: " + (success ? "成功" : "失败"));

            shell.release();
            return success;

        } catch (Exception e) {
            Log.e(TAG, "启用无障碍服务异常", e);
            return false;
        }
    }

    /**
     * 跳转到系统无障碍设置页面。
     */
    public void openSettings() {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    /**
     * 检查无障碍服务是否已启用。
     */
    public boolean isEnabled() {
        String settingValue = Settings.Secure.getString(
                context.getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (settingValue == null || settingValue.isEmpty()) {
            return false;
        }

        if (settingValue.contains(ACCESSIBILITY_SERVICE_CLASS)) {
            return true;
        }
        if (settingValue.contains("PaymentAccessibilityService")) {
            return true;
        }
        return false;
    }
}
