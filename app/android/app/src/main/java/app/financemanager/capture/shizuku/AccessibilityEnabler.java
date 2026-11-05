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

    /**
     * ⚠️ 必须用 Manifest 实际注册的伪装类名（见 PaymentAccessibilityService.REAL_SERVICE_CLASS 注释）。
     * 此前误用父类名去写系统设置，写入的是未注册组件——系统不会启动任何服务，
     * 但按同一错误名匹配的检查却显示"已启用"。
     */
    private static final String ACCESSIBILITY_SERVICE_CLASS =
            app.financemanager.capture.accessibility.PaymentAccessibilityService.REAL_SERVICE_CLASS;

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
            ShizukuShell shell = ShizukuShell.getInstance(context.getPackageName());

            // 获取当前已启用的无障碍服务列表
            // ⚠️ exec 失败返回 null（如 UserService 尚未绑定完成），必须判空
            String cmdGet = "settings get secure enabled_accessibility_services";
            String raw = shell.exec(cmdGet);
            if (raw == null) {
                Log.w(TAG, "读取无障碍服务列表失败（Shizuku 未就绪）");
                return false;
            }
            String current = raw.trim();
            if (current.equals("null") || current.isEmpty()) {
                current = "";
            }

            Log.d(TAG, "当前已启用无障碍服务: " + current);

            // 移除历史 bug 写入的错误类名条目（只加不清会让它随每次恢复永远残留）
            String cleaned = removeBrokenEntry(current);
            if (!cleaned.equals(current)) {
                Log.i(TAG, "已从无障碍列表移除存量错误条目: " + current + " -> " + cleaned);
                current = cleaned;
            }

            // 如果已经启用，返回成功
            if (current.contains(componentName)) {
                Log.d(TAG, "无障碍服务已启用");
                return true;
            }

            // 添加到列表
            String newList = current.isEmpty() ? componentName : (current + ":" + componentName);

            String result1 = shell.exec("settings put secure enabled_accessibility_services " + newList);
            String result2 = shell.exec("settings put secure accessibility_enabled 1");
            if (result1 == null || result2 == null) {
                Log.w(TAG, "启用命令执行失败（Shizuku 未就绪或命令异常）");
                return false;
            }

            // 复核：回读确认真实生效（此前只判非 null，put 失败也会误报成功）
            String verify = shell.exec(cmdGet);
            boolean success = verify != null && verify.contains(componentName);
            Log.d(TAG, "启用无障碍服务: " + (success ? "成功" : "失败"));

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
        if (settingValue.contains("SelectToSpeakService")) {
            return true;
        }
        return false;
    }

    /** 历史 bug 遗留的错误类名（未在 Manifest 注册，系统无法启动，见 REAL_SERVICE_CLASS 注释）。 */
    private static final String LEGACY_BROKEN_ENTRY =
            "app.financemanager.capture.accessibility.PaymentAccessibilityService";

    /** 从启用串中移除错误类名条目（其余条目原样保留，顺序不变）。 */
    private static String removeBrokenEntry(String setting) {
        StringBuilder out = new StringBuilder();
        for (String entry : setting.split(":")) {
            String t = entry.trim();
            if (t.isEmpty()) continue;
            if (t.equals(LEGACY_BROKEN_ENTRY) || t.endsWith("/" + LEGACY_BROKEN_ENTRY)) {
                continue;
            }
            if (out.length() > 0) out.append(':');
            out.append(t);
        }
        return out.toString();
    }

    /**
     * 修复存量错误配置：enabled_accessibility_services 中若含历史 bug 写入的错误类名条目，
     * 替换为正确的组件名（保留 GKD 等其他 APP 的条目）。
     *
     * 背景：旧版自动启用逻辑误用父类名写系统设置——该条目系统无法启动，服务一旦被杀
     * 就再也重绑不上（表现为健康条"未连接"、日志无无障碍记录）。写入需要 Shizuku；
     * 不可用时仅记录诊断日志，不做任何变更。
     *
     * @return true=无需修复或修复成功；false=检测到问题但未能修复（如 Shizuku 不可用）
     */
    public boolean fixLegacyConfig() {
        try {
            String setting = Settings.Secure.getString(
                    context.getContentResolver(),
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (setting == null || setting.isEmpty()) {
                return true;
            }
            if (!setting.contains(LEGACY_BROKEN_ENTRY)) {
                return true; // 无错误条目
            }

            String correct = getComponentName();
            String cleanedCurrent = removeBrokenEntry(setting);
            String newList = cleanedCurrent.isEmpty()
                    ? correct
                    : (cleanedCurrent + ":" + correct);
            Log.w(TAG, "修正无障碍存量配置: " + setting + " -> " + newList);

            // 启动竞态：load() 触发时 Shizuku UserService 可能尚未绑定完成，
            // 等待其就绪（最多 ~12s）再写，否则会像首次启动那样静默失败
            boolean shizukuReady = false;
            for (int attempt = 0; attempt < 8; attempt++) {
                if (ShizukuShell.isAvailable()) {
                    shizukuReady = true;
                    break;
                }
                Thread.sleep(1500);
            }
            if (!shizukuReady) {
                Log.w(TAG, "Shizuku 不可用，无法自动修正无障碍存量配置（需用户手动重开一次无障碍）");
                return false;
            }
            ShizukuShell shell = ShizukuShell.getInstance(context.getPackageName());
            String r1 = shell.exec("settings put secure enabled_accessibility_services " + newList);
            String r2 = shell.exec("settings put secure accessibility_enabled 1");
            String verify = shell.exec("settings get secure enabled_accessibility_services");
            boolean ok = r1 != null && r2 != null && verify != null
                    && verify.contains(correct)
                    && !verify.contains(LEGACY_BROKEN_ENTRY);
            Log.i(TAG, "修正无障碍存量配置: " + (ok ? "成功" : "失败"));
            return ok;
        } catch (Exception e) {
            Log.w(TAG, "修正无障碍存量配置异常", e);
            return false;
        }
    }
}
