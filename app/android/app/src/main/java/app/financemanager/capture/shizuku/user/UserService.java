package app.financemanager.capture.shizuku.user;

import android.util.Log;

import androidx.annotation.Keep;

import app.financemanager.capture.shizuku.IShell;

import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Shizuku UserService 实现。
 *
 * 在 Shizuku 授权的进程中运行，可以执行 ADB shell 命令。
 * 通过 Binder (AIDL) 与主进程通信。
 *
 * daemon(true) 模式下，此服务常驻在 Shizuku 进程中，
 * 不会因主 APP 被杀而消失。
 *
 * 内置守护线程：每 30 秒检查一次无障碍服务状态，如果被系统杀死则自动恢复。
 * 这就是 GKD 的核心保活策略——Shizuku 长驻 + 定时恢复。
 *
 * 参考：AutoAccounting 项目的 UserService.kt，GKD 的 Watchdog
 */
@Keep
public class UserService extends IShell.Stub {

    private static final String TAG = "ShizukuUserService";
    /** ⚠️ 必须用 Manifest 实际注册的伪装类名（见 PaymentAccessibilityService.REAL_SERVICE_CLASS 注释）。 */
    private static final String ACCESSIBILITY_SERVICE_CLASS =
            app.financemanager.capture.accessibility.PaymentAccessibilityService.REAL_SERVICE_CLASS;
    private static final long CHECK_INTERVAL_MS = 30_000; // 30 秒检查一次

    private volatile boolean running = true;
    private Thread watchdogThread;

    public UserService() {
        Log.d(TAG, "UserService 创建，启动守护线程");
        startWatchdog();
    }

    /**
     * 守护线程：定期检查无障碍服务是否存活，被杀则自动恢复。
     */
    private void startWatchdog() {
        watchdogThread = new Thread(() -> {
            Log.d(TAG, "A11yWatchdog 线程启动");
            while (running) {
                try {
                    Thread.sleep(CHECK_INTERVAL_MS);
                } catch (InterruptedException e) {
                    Log.d(TAG, "A11yWatchdog 线程被中断");
                    Thread.currentThread().interrupt();
                    break;
                }
                try {
                    checkAndRestoreAccessibility();
                } catch (Exception e) {
                    Log.w(TAG, "A11yWatchdog 检查失败", e);
                }
            }
            Log.d(TAG, "A11yWatchdog 线程退出");
        }, "A11yWatchdog");
        watchdogThread.setDaemon(true);
        watchdogThread.start();
    }

    /**
     * 检查无障碍服务是否在已启用列表中，不在则通过 ADB 命令自动恢复。
     */
    private void checkAndRestoreAccessibility() {
        try {
            String current = execShell("settings get secure enabled_accessibility_services");
            if (current == null) current = "";

            Log.d(TAG, "A11yWatchdog 检查: enabled_services=" + current);

            if (current.contains(ACCESSIBILITY_SERVICE_CLASS)
                    || current.contains("SelectToSpeakService")) {
                Log.d(TAG, "A11yWatchdog: 无障碍服务正常，跳过");
                return;
            }

            // 无障碍服务已被系统杀死，尝试恢复
            Log.w(TAG, "A11yWatchdog: 无障碍服务已断开，尝试恢复");
            String newList = current.isEmpty()
                    ? ACCESSIBILITY_SERVICE_CLASS
                    : current + ":" + ACCESSIBILITY_SERVICE_CLASS;

            String r1 = execShell("settings put secure enabled_accessibility_services " + newList);
            String r2 = execShell("settings put secure accessibility_enabled 1");

            if (r1 != null && r2 != null) {
                Log.d(TAG, "A11yWatchdog: 无障碍服务已恢复");
            } else {
                Log.e(TAG, "A11yWatchdog: 恢复失败 r1=" + r1 + " r2=" + r2);
            }
        } catch (Exception e) {
            Log.w(TAG, "A11yWatchdog: 检查/恢复异常", e);
        }
    }

    private String execShell(String command) throws Exception {
        StringBuilder output = new StringBuilder();
        Process process = null;
        try {
            process = new ProcessBuilder("sh", "-c", command)
                    .redirectErrorStream(true)
                    .start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }
            process.waitFor();
        } catch (Exception e) {
            Log.e(TAG, "execShell 失败: " + command, e);
            throw e;
        } finally {
            if (process != null) {
                try {
                    process.destroy();
                } catch (Exception ignored) {}
            }
        }
        return output.toString().trim();
    }

    /** Shizuku 解绑时的生命周期回调（非 IShell 接口方法）。 */
    public void destroy() {
        running = false;
        if (watchdogThread != null) {
            watchdogThread.interrupt();
        }
        Log.d(TAG, "UserService destroyed");
        System.exit(0);
    }

    @Override
    public String execCommand(String command) {
        if (command == null || command.isEmpty()) {
            return "";
        }
        try {
            return execShell(command);
        } catch (Exception e) {
            Log.e(TAG, "execCommand 失败: " + command, e);
            return "";
        }
    }
}