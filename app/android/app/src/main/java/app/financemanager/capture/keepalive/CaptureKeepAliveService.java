package app.financemanager.capture.keepalive;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import app.financemanager.MainActivity;

/**
 * 前台保活服务。
 *
 * 小米澎湃 OS 在 APP 退到后台后会杀死整个进程，连带无障碍服务一起被杀。
 * 此服务在前台运行，阻止 OS 杀死主进程，从而让无障碍服务持续存活。
 *
 * 通知栏显示：一条低优先级、静音、不可清除的通知，标题为 "自动记账运行中"。
 * 用户可在设置里关闭通知图标显示，但通知本身必须存在（Android 8+ 前台服务要求）。
 *
 * 生命周期：
 * - 无障碍服务启用时启动
 * - 无障碍服务禁用时停止
 * - APP 进程被杀后，随无障碍服务重新创建时重启
 */
public class CaptureKeepAliveService extends Service {

    private static final String TAG = "CaptureKeepAlive";
    private static final int NOTIFICATION_ID = 1001;
    private static final String CHANNEL_ID = "capture_keep_alive";
    private static final String CHANNEL_NAME = "自动记账";

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate: 保活服务启动");
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand: startId=" + startId);
        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);
        // 被杀后由系统重启
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "onDestroy: 保活服务停止");
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_MIN
            );
            channel.setDescription("自动记账服务运行中");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
            channel.enableVibration(false);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("自动记账运行中")
                .setContentText("无障碍服务正在监听支付通知")
                .setSmallIcon(android.R.drawable.ic_menu_manage)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }

    /**
     * 启动保活服务。
     */
    public static void start(Context context) {
        Intent intent = new Intent(context, CaptureKeepAliveService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    /**
     * 停止保活服务。
     */
    public static void stop(Context context) {
        Intent intent = new Intent(context, CaptureKeepAliveService.class);
        context.stopService(intent);
    }
}