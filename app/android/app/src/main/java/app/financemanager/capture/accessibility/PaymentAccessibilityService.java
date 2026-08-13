package app.financemanager.capture.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import app.financemanager.local.capture.CaptureQueueDao;
import app.financemanager.local.capture.CaptureQueueDatabase;
import app.financemanager.local.capture.CaptureQueueEntity;
import app.financemanager.capture.plugin.PaymentCapturePlugin;

import java.util.UUID;

/**
 * 自动记账无障碍服务。
 *
 * 仅监听白名单支付 APP 的窗口变化事件，提取支付成功页和账单列表的文本信息。
 * 严格只读，不点击、不输入、不执行手势。
 *
 * 生命周期：
 * - onServiceConnected()：记录服务状态，注册监听器
 * - onAccessibilityEvent()：窗口变化时触发解析
 * - onDestroy()：清理资源
 */
public class PaymentAccessibilityService extends AccessibilityService {

    private static final String TAG = "PaymentAccessService";

    public static final String PARSER_VERSION = "0.1.0";

    /** 最近一次成功捕获的包名（用于状态展示） */
    private volatile String lastSourcePackage = null;
    private volatile String lastSourceName = null;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        Log.d(TAG, "onServiceConnected: 无障碍服务已启动");

        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                | AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS;
        info.notificationTimeout = 100;
        setServiceInfo(info);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        String packageName = event.getPackageName() != null
                ? event.getPackageName().toString()
                : "";

        // 白名单过滤
        if (!WhitelistPackages.contains(packageName)) return;

        // 仅处理窗口状态变化（切到支付成功页/转账页/账单页时触发）
        int eventType = event.getEventType();
        if (eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            return;
        }

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        try {
            processWindow(packageName, root);
        } finally {
            root.recycle();
        }
    }

    /**
     * 解析窗口内容，写入捕获队列。
     */
    private void processWindow(String packageName, AccessibilityNodeInfo root) {
        PaymentParserAdapter adapter = PaymentParserRegistry.forPackage(packageName);
        if (adapter == null) {
            Log.d(TAG, "无适配器: " + packageName);
            return;
        }

        CapturedPaymentInfo info = adapter.parse(this, root);
        if (info == null) {
            Log.d(TAG, "未解析出支付信息: " + packageName);
            return;
        }

        // 去重检查
        if (CaptureDedup.isDuplicate(info.getSourcePackage(), info.getAmountMinor())) {
            Log.d(TAG, "去重跳过: " + info.getSourcePackage() + " 金额=" + info.getAmount());
            return;
        }

        // 写入捕获队列
        writeToQueue(info);
    }

    /**
     * 将解析结果写入 Room 捕获队列，并尝试推送给前端。
     */
    private void writeToQueue(CapturedPaymentInfo info) {
        try {
            CaptureQueueDao dao = CaptureQueueDatabase
                    .getInstance(this.getApplicationContext())
                    .captureQueueDao();

            String fingerprint = buildFingerprint(info);

            CaptureQueueEntity entity = new CaptureQueueEntity();
            entity.setSourcePackage(orNull(info.getSourcePackage()));
            entity.setSourceName(orNull(info.getSourceName()));
            entity.setCaptureMethod("accessibility");
            entity.setOccurredAt(String.valueOf(System.currentTimeMillis()));
            entity.setAmountMinor(info.getAmountMinor());
            entity.setCurrency("CNY");
            entity.setMerchant(info.getMerchant());
            entity.setAccountHint(info.getAccountHint());
            entity.setSourceOrderId(info.getOrderNo());
            entity.setRawFingerprint(fingerprint);
            entity.setConfidence(parseConfidence(info.getConfidence()));
            entity.setParserVersion(PARSER_VERSION);
            entity.setStatus("pending");
            entity.setCreatedAt(System.currentTimeMillis());

            dao.insert(entity);

            lastSourcePackage = info.getSourcePackage();
            lastSourceName = info.getSourceName();

            Log.d(TAG, "已写入捕获队列: id=" + entity.getId()
                    + " " + info.getSourceName() + " " + info.getAmount());
        } catch (Exception e) {
            Log.w(TAG, "写入捕获队列失败", e);
        }
    }

    private static String orNull(String v) {
        return v != null ? v : "";
    }

    private static String buildFingerprint(CapturedPaymentInfo info) {
        return info.getSourcePackage() + ":"
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

    @Override
    public void onInterrupt() {
        Log.w(TAG, "onInterrupt: 无障碍服务被系统中断");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "onDestroy: 无障碍服务已销毁");
    }

    public String getLastSourcePackage() { return lastSourcePackage; }
    public String getLastSourceName() { return lastSourceName; }
}