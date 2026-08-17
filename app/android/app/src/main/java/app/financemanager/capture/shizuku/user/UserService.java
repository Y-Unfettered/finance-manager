package app.financemanager.capture.shizuku.user;

import android.os.RemoteException;
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
 * 参考：AutoAccounting 项目的 UserService.kt
 */
@Keep
public class UserService extends IShell.Stub {

    private static final String TAG = "ShizukuUserService";

    @Override
    public void destroy() {
        Log.d(TAG, "UserService destroyed");
        System.exit(0);
    }

    @Override
    public String execCommand(String command) throws RemoteException {
        if (command == null || command.isEmpty()) {
            return "";
        }

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
            Log.e(TAG, "execCommand 失败: " + command, e);
            return "";
        } finally {
            if (process != null) {
                try {
                    process.destroy();
                } catch (Exception ignored) {}
            }
        }

        return output.toString();
    }
}
