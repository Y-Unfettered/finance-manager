package app.financemanager.capture.shizuku;

import android.content.ComponentName;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.IBinder;
import android.util.Log;

import rikka.shizuku.Shizuku;
import rikka.shizuku.Shizuku.UserServiceArgs;

import app.financemanager.capture.shizuku.IShell;
import app.financemanager.capture.shizuku.user.UserService;

/**
 * Shizuku Shell 封装。
 *
 * 通过 Shizuku 绑定 UserService（本地 AIDL 服务），执行 ADB shell 命令。
 * 用于自动启用无障碍服务，绕过小米等定制 ROM 对无障碍权限的限制。
 *
 * 参考：AutoAccounting 项目的 Shell.kt + ShizukuShell.kt
 *
 * 注意：
 * - Shizuku 必须已安装并在用户授权
 * - 本类的 exec() 方法可在任何线程调用
 * - 命令执行以 shell 身份运行，可访问 Settings.Secure 等系统设置
 */
public class ShizukuShell {

    private static final String TAG = "ShizukuShell";

    private final String packageName;
    private volatile IShell mUserService;

    private final Object lock = new Object();

    public ShizukuShell(String packageName) {
        this.packageName = packageName;
    }

    /**
     * 检查 Shizuku 是否可用且已授权。
     */
    public static boolean isAvailable() {
        try {
            if (!Shizuku.pingBinder()) {
                Log.d(TAG, "Shizuku 未运行");
                return false;
            }
            int version = Shizuku.getVersion();
            boolean isPreV11 = Shizuku.isPreV11();
            boolean permissionGranted = Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;

            Log.d(TAG, "Shizuku version=" + version
                    + ", preV11=" + isPreV11
                    + ", permission=" + permissionGranted);

            return version >= 11 && !isPreV11 && permissionGranted;
        } catch (Exception e) {
            Log.w(TAG, "检查 Shizuku 状态异常", e);
            return false;
        }
    }

    /** 检查 Shizuku 是否运行。 */
    public static boolean isRunning() {
        try {
            return Shizuku.pingBinder();
        } catch (Exception e) {
            return false;
        }
    }

    /** 检查 Shizuku 版本是否满足要求。 */
    public static boolean isSupported() {
        try {
            return Shizuku.pingBinder()
                    && Shizuku.getVersion() >= 11
                    && !Shizuku.isPreV11();
        } catch (Exception e) {
            return false;
        }
    }

    /** 检查是否已授权。 */
    public static boolean isPermissionGranted() {
        try {
            return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            return false;
        }
    }

    /** 请求 Shizuku 授权。 */
    public static void requestPermission() {
        try {
            Shizuku.requestPermission(0);
            Log.d(TAG, "已请求 Shizuku 授权");
        } catch (Exception e) {
            Log.w(TAG, "请求 Shizuku 授权失败", e);
        }
    }

    /** 获取 Shizuku 版本号。 */
    public static int getVersion() {
        try {
            return Shizuku.getVersion();
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * 绑定 UserService（线程安全）。
     *
     * @return IShell 接口，失败时返回 null
     */
    public IShell bindUserService() {
        synchronized (lock) {
            if (mUserService != null) {
                return mUserService;
            }

            if (!isAvailable()) {
                Log.w(TAG, "Shizuku 不可用，无法绑定 UserService");
                return null;
            }

            try {
                ComponentName componentName = new ComponentName(packageName, UserService.class.getName());
                UserServiceArgs args = new UserServiceArgs(componentName)
                        .daemon(false)
                        .processNameSuffix("service");

                Shizuku.bindUserService(args, new ServiceConnection() {
                    @Override
                    public void onServiceConnected(ComponentName name, IBinder service) {
                        if (service != null && service.pingBinder()) {
                            mUserService = IShell.Stub.asInterface(service);
                            Log.d(TAG, "UserService 已绑定");
                        } else {
                            Log.w(TAG, "UserService IBinder ping 失败");
                        }
                    }

                    @Override
                    public void onServiceDisconnected(ComponentName name) {
                        mUserService = null;
                        Log.d(TAG, "UserService 已断开");
                    }
                });

                return mUserService;
            } catch (Exception e) {
                Log.e(TAG, "绑定 UserService 失败", e);
                return null;
            }
        }
    }

    /**
     * 执行 shell 命令。
     *
     * @param command 要执行的 shell 命令
     * @return 命令输出，失败时返回空字符串
     */
    public String exec(String command) {
        Log.d(TAG, "exec: " + command);

        if (!isAvailable()) {
            Log.w(TAG, "Shizuku 不可用，无法执行命令");
            return "";
        }

        IShell service = bindUserService();
        if (service == null) {
            Log.e(TAG, "UserService 不可用");
            return "";
        }

        try {
            String result = service.execCommand(command);
            String preview = result != null ? result.substring(0, Math.min(result.length(), 200)) : "null";
            Log.d(TAG, "exec result: " + preview);
            return result != null ? result : "";
        } catch (Exception e) {
            Log.e(TAG, "命令执行失败", e);
            return "";
        }
    }

    /** 断开 UserService 连接。 */
    public void release() {
        synchronized (lock) {
            mUserService = null;
        }
    }
}
