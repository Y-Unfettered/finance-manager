package app.financemanager.capture.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;


import app.financemanager.local.capture.CaptureQueueDao;
import app.financemanager.local.capture.CaptureQueueDatabase;
import app.financemanager.local.capture.CaptureQueueEntity;
import app.financemanager.local.PaymentCapturePlugin;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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

    /** 后台线程池：Room 数据库操作必须脱离主线程执行 */
    private static final ExecutorService DB_EXECUTOR = Executors.newSingleThreadExecutor();

    /**
     * 防重复插入冷却期：同一来源+金额在 5 秒内只处理一次。
     * 窗口变化事件（TYPE_WINDOW_CONTENT_CHANGED）会频繁触发，
     * 支付宝成功页停留期间会收到多次事件，需要抑制。
     */
    private static final long INSERT_COOLDOWN_MS = 5000;

    private volatile long lastInsertTime = 0;
    private volatile String lastInsertKey = "";

    public static final String PARSER_VERSION = "0.1.0";

    /** 主线程 Handler：用于非阻塞重试 getRootInActiveWindow() */
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    /** 事件去抖：同一包名 500ms 内只处理一次，避免任务栏预览时大量事件堵塞主线程 */
    private volatile long lastProcessedTime = 0;
    private volatile String lastProcessedPackage = "";
    private static final long THROTTLE_MS = 500;

    /** 最近一次成功捕获的包名（用于状态展示） */
    private volatile String lastSourcePackage = null;
    private volatile String lastSourceName = null;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        AccessibilityDiagnostics.serviceConnected(this.getApplicationContext());
        Log.d(TAG, "onServiceConnected: 无障碍服务已启动");

        // 启动前台保活服务，防止主进程被系统杀死导致无障碍服务断开

        // 注意：FLAG_REPORT_VIEW_IDS 在小米澎湃 OS / HarmonyOS 等定制 ROM 上会导致
        // setServiceInfo() 抛 SecurityException，进而使服务启用即崩溃、被系统移除。
        // 采用"完整 flags → 降级 flags"策略：先尝试包含重要节点 flag，失败则降级。
        int preferredFlags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS;
        int fallbackFlags = 0;

        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.notificationTimeout = 100;

        boolean configured = false;
        for (int flags : new int[]{preferredFlags, fallbackFlags}) {
            try {
                info.flags = flags;
                setServiceInfo(info);
                configured = true;
                Log.d(TAG, "setServiceInfo 成功: flags=" + flags);
                break;
            } catch (SecurityException e) {
                Log.w(TAG, "setServiceInfo 被拒绝 flags=" + flags + "，尝试降级", e);
            } catch (Exception e) {
                Log.w(TAG, "setServiceInfo 异常 flags=" + flags + "，尝试降级", e);
            }
        }
        if (!configured) {
            Log.e(TAG, "setServiceInfo 全部失败，无障碍服务将无法正常捕获窗口事件");
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        String packageName = event.getPackageName() != null
                ? event.getPackageName().toString()
                : "";

        // 白名单过滤
        if (!WhitelistPackages.contains(packageName)) return;

        int eventType = event.getEventType();
        if (eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            return;
        }

        // 去抖：同一包名 500ms 内只处理一次，避免任务栏预览时大量事件堵塞主线程
        if (isThrottled(packageName)) return;
        markProcessed(packageName);

        AccessibilityDiagnostics.event(packageName, eventType);

        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null) {
            AccessibilityDiagnostics.getRootRetry(0, true);
            try {
                processWindow(packageName, root);
            } finally {
                root.recycle();
            }
            return;
        }

        // 首次获取失败：捕获降级节点，非阻塞重试
        final AccessibilityNodeInfo[] fallbackRef = new AccessibilityNodeInfo[1];
        try {
            fallbackRef[0] = event.getSource();
            if (fallbackRef[0] != null) {
                AccessibilityDiagnostics.getRootFallback("source");
            }
        } catch (Exception ignored) {
            fallbackRef[0] = null;
        }

        final String pkg = packageName;

        mainHandler.postDelayed(() -> {
            AccessibilityNodeInfo retryRoot = getRootInActiveWindow();
            if (retryRoot != null) {
                AccessibilityDiagnostics.getRootRetry(1, true);
                try {
                    processWindow(pkg, retryRoot);
                } finally {
                    retryRoot.recycle();
                }
            } else if (fallbackRef[0] != null) {
                final AccessibilityNodeInfo fallback = fallbackRef[0];
                try {
                    processWindow(pkg, fallback);
                } finally {
                    fallback.recycle();
                }
            } else {
                AccessibilityDiagnostics.getRootRetry(1, false);
                AccessibilityDiagnostics.rootNull(pkg);
            }
        }, 50);
    }

    private boolean isThrottled(String packageName) {
        long now = System.currentTimeMillis();
        if (packageName.equals(lastProcessedPackage) && (now - lastProcessedTime) < THROTTLE_MS) {
            return true;
        }
        return false;
    }

    private void markProcessed(String packageName) {
        lastProcessedTime = System.currentTimeMillis();
        lastProcessedPackage = packageName;
    }

    /**
     * 解析窗口内容，写入捕获队列。
     *
     * 解析策略（优先级从高到低）：
     * 1. RuleBasedParser：基于用户配置的 JSON 规则（支持自定义规则）
     * 2. PaymentParserRegistry：预置的硬编码适配器
     * 3. 都不成功则跳过
     */
    private void processWindow(String packageName, AccessibilityNodeInfo root) {
        CapturedPaymentInfo info = null;

        // 策略 1：尝试基于规则的解析器
        try {
            app.financemanager.capture.accessibility.rules.RuleBasedParser ruleParser =
                    new app.financemanager.capture.accessibility.rules.RuleBasedParser();
            info = ruleParser.parse(this, root, packageName);
            if (info != null) {
                Log.d(TAG, "RuleBasedParser 解析成功: " + packageName);
            }
        } catch (Exception e) {
            Log.d(TAG, "RuleBasedParser 跳过: " + e.getMessage());
        }

        // 策略 2：回退到硬编码适配器
        if (info == null) {
            PaymentParserAdapter adapter = PaymentParserRegistry.forPackage(packageName);
            if (adapter != null) {
                info = adapter.parse(this, root);
                if (info != null) {
                    Log.d(TAG, "硬编码适配器解析成功: " + packageName);
                }
            } else {
                AccessibilityDiagnostics.noAdapter(packageName);
            }
        }

        if (info == null) {
            Log.d(TAG, "未解析出支付信息: " + packageName);
            return;
        }

        // 去重检查
        if (CaptureDedup.isDuplicate(info.getSourcePackage(), info.getAmountMinor())) {
            AccessibilityDiagnostics.dedup(packageName);
            Log.d(TAG, "去重跳过: " + info.getSourcePackage() + " 金额=" + info.getAmount());
            return;
        }

        // 写入捕获队列
        writeToQueue(info);
    }

    /**
     * 将解析结果写入 Room 捕获队列，并推送给前端。
     *
     * Room 数据库操作必须在后台线程执行，主线程上调用 insert() 会抛
     * IllegalStateException("assertNotSuspendingTransaction")。
     * 此处通过单线程执行器提交到后台线程执行。
     */
    private void writeToQueue(CapturedPaymentInfo info) {
        // 冷却期检查：避免同一支付页面在停留期间被重复插入
        long now = System.currentTimeMillis();
        String key = info.getSourcePackage() + ":" + info.getAmountMinor();
        synchronized (this) {
            if (key.equals(lastInsertKey) && (now - lastInsertTime) < INSERT_COOLDOWN_MS) {
                Log.d(TAG, "冷却期内跳过重复插入: " + key);
                return;
            }
            lastInsertTime = now;
            lastInsertKey = key;
        }

        DB_EXECUTOR.execute(() -> {
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
                entity.setSuggestedCategory(info.getSuggestedCategory());
                entity.setDefaultAccountId(info.getDefaultAccountId());
                entity.setCreatedAt(System.currentTimeMillis());

                dao.insert(entity);

                AccessibilityDiagnostics.queueInsert(info.getSourcePackage(), entity.getId());
                PaymentCapturePlugin.notifyCandidate(entity);
                PaymentCapturePlugin.notifyQuickEntry(entity);

                lastSourcePackage = info.getSourcePackage();
                lastSourceName = info.getSourceName();

                Log.d(TAG, "已写入捕获队列: id=" + entity.getId()
                        + " " + info.getSourceName() + " " + info.getAmount());
            } catch (Exception e) {
                AccessibilityDiagnostics.queueFail(info.getSourcePackage(), e.getMessage());
                Log.w(TAG, "写入捕获队列失败", e);
            }
        });
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
        AccessibilityDiagnostics.serviceDestroyed(this.getApplicationContext());
        super.onDestroy();
        Log.d(TAG, "onDestroy: 无障碍服务已销毁");
    }

    public String getLastSourcePackage() { return lastSourcePackage; }
    public String getLastSourceName() { return lastSourceName; }
}