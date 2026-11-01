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
 * 长驻模式：daemon(true) 让 UserService 像 GKD 一样长期运行在 Shizuku 进程中，
 * 不会因主 APP 被杀而消失。配合 AccessibilityMonitorService 实现无障碍自动恢复。
 *
 * 参考：AutoAccounting 项目的 Shell.kt + ShizukuShell.kt，GKD 的 Shizuku 用法
 *
 * 注意：
 * - Shizuku 必须已安装并在用户授权
 * - 本类的 exec() 方法可在任何线程调用
 * - 命令执行以 shell 身份运行，可访问 Settings.Secure 等系统设置
 */
public class ShizukuShell {

    private static final String TAG = "ShizukuShell";
    private static final boolean DAEMON = true;

    private final String packageName;
    private volatile IShell mUserService;

    private final Object lock = new Object();

    private static volatile ShizukuShell sInstance;

    /**
     * 全局单例：Shizuku 库内部为每次 bindUserService 创建 connection 对象，
     * 多实例重复绑定会触发库内并发 bug（ConcurrentModificationException，已实测崩溃循环）。
     * 全局只允许一个实例、一条 UserService 连接。
     */
    public static ShizukuShell getInstance(String packageName) {
        if (sInstance == null) {
            synchronized (ShizukuShell.class) {
                if (sInstance == null) {
                    sInstance = new ShizukuShell(packageName);
                }
            }
        }
        return sInstance;
    }

    private ShizukuShell(String packageName) {
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
                        .daemon(DAEMON)
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
     * @return 命令输出；Shizuku 不可用 / UserService 未绑定 / 执行异常时返回 null。
     *          ⚠️ 必须判 null——冷启动时 UserService 异步绑定尚未完成，此前的实现
     *          失败返回 ""，被调用方 `result != null` 判成"成功"，造成恢复成功假象。
     */
    public String exec(String command) {
        Log.d(TAG, "exec: " + command);

        if (!isAvailable()) {
            Log.w(TAG, "Shizuku 不可用，无法执行命令");
            return null;
        }

        IShell service = bindUserService();
        if (service == null) {
            Log.e(TAG, "UserService 不可用（可能绑定尚未完成，稍后重试）");
            return null;
        }

        try {
            String result = service.execCommand(command);
            String preview = result != null ? result.substring(0, Math.min(result.length(), 200)) : "null";
            Log.d(TAG, "exec result: " + preview);
            return result;
        } catch (Exception e) {
            Log.e(TAG, "命令执行失败", e);
            return null;
        }
    }

    /** 断开 UserService 连接。 */
    public void release() {
        synchronized (lock) {
            mUserService = null;
        }
    }
}
