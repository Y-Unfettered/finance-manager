package app.financemanager.capture.notification;

import android.content.Context;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import app.financemanager.capture.accessibility.CaptureDedup;
import app.financemanager.capture.accessibility.CapturedPaymentInfo;
import app.financemanager.capture.accessibility.WhitelistPackages;
import app.financemanager.local.capture.CaptureQueueDao;
import app.financemanager.local.capture.CaptureQueueDatabase;
import app.financemanager.local.capture.CaptureQueueEntity;

import java.util.UUID;

/**
 * 支付通知监听服务。
 *
 * 监听白名单 APP 的通知栏消息，当支付 APP 发送支付结果通知时，
 * 解析通知文本提取金额/商户/账户信息，写入捕获队列。
 *
 * 这是无障碍服务的兜底通道：当用户不打开支付 APP（仅看通知）或
 * 无障碍服务被系统关闭时仍然有效。
 */
public class PaymentNotificationListenerService extends NotificationListenerService {

    private static final String TAG = "PaymentNotifListener";
    public static final String PARSER_VERSION = "0.1.0";

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "onListenerConnected: 通知监听服务已连接");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        String packageName = sbn.getPackageName();
        if (!WhitelistPackages.contains(packageName)) return;

        try {
            String title = sbn.getNotification().extras
                    .getString(android.app.Notification.EXTRA_TITLE, "");
            CharSequence textChar = sbn.getNotification().extras
                    .getCharSequence(android.app.Notification.EXTRA_TEXT);
            String text = textChar != null ? textChar.toString() : "";

            processNotification(packageName, title, text);
        } catch (Exception e) {
            Log.w(TAG, "onNotificationPosted: 处理失败 package=" + packageName, e);
        }
    }

    private void processNotification(String packageName, String title, String text) {
        NotificationParserAdapter adapter = NotificationParserRegistry.forPackage(packageName);
        if (adapter == null) return;

        CapturedPaymentInfo info = adapter.parse(title, text, packageName);
        if (info == null) return;

        if (CaptureDedup.isDuplicate(info.getSourcePackage(), info.getAmountMinor())) {
            Log.d(TAG, "去重跳过通知: " + info.getSourcePackage());
            return;
        }

        writeToQueue(info);
    }

    private void writeToQueue(CapturedPaymentInfo info) {
        try {
            CaptureQueueDao dao = CaptureQueueDatabase
                    .getInstance(this.getApplicationContext())
                    .captureQueueDao();

            CaptureQueueEntity entity = new CaptureQueueEntity();
            entity.setSourcePackage(info.getSourcePackage() != null ? info.getSourcePackage() : "unknown");
            entity.setSourceName(info.getSourceName() != null ? info.getSourceName() : "notification");
            entity.setCaptureMethod("notification");
            entity.setOccurredAt(String.valueOf(System.currentTimeMillis()));
            entity.setAmountMinor(info.getAmountMinor());
            entity.setCurrency("CNY");
            entity.setMerchant(info.getMerchant());
            entity.setAccountHint(info.getAccountHint());
            entity.setSourceOrderId(info.getOrderNo());
            entity.setRawFingerprint(buildFingerprint(info));
            entity.setConfidence(parseConfidence(info.getConfidence()));
            entity.setParserVersion(PARSER_VERSION);
            entity.setStatus("pending");
            entity.setCreatedAt(System.currentTimeMillis());

            dao.insert(entity);
            Log.d(TAG, "通知已写入捕获队列: " + info.getSourceName()
                    + " " + info.getAmount());
        } catch (Exception e) {
            Log.w(TAG, "通知写入队列失败", e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // 不需要处理通知移除
    }

    private static String buildFingerprint(CapturedPaymentInfo info) {
        return info.getSourcePackage() + ":"
                + "notif:"
                + (info.getAmountMinor() != null ? info.getAmountMinor() : "0")
                + ":" + (info.getMerchant() != null ? info.getMerchant() : "")
                + ":" + UUID.randomUUID().toString().substring(0, 8);
    }

    private static float parseConfidence(String level) {
        switch (level) {
            case "high": return 1.0f;
            case "medium": return 0.7f;
            case "low": return 0.4f;
            default: return 0.5f;
        }
    }
}