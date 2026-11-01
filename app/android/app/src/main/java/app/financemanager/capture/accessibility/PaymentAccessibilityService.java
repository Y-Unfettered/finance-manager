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
import app.financemanager.local.capture.CaptureFingerprintEntity;
import app.financemanager.local.PaymentCapturePlugin;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
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

    /**
     * 系统设置/无障碍 API 中真实的组件类名。
     * ⚠️ Manifest 注册的是本类的伪装子类（见 com.google.android.accessibility.selecttospeak
     * 包下的 SelectToSpeakService），此前 AccessibilityEnabler/UserService/健康检查
     * 全部误用本类名"PaymentAccessibilityService"去写系统设置和匹配——写入的是
     * 未注册组件，系统不会启动任何服务，但按错误类名匹配的检查却显示"已启用"。
     * 所有系统级读写与匹配必须用本常量。
     */
    public static final String REAL_SERVICE_CLASS =
            "com.google.android.accessibility.selecttospeak.SelectToSpeakService";

    /** 服务当前是否已连接（活信号：设置开关开着 ≠ 服务活着，MIUI 杀后台后设置仍是 on）。 */
    public static volatile boolean sServiceConnected = false;

    /** 后台线程池：Room 数据库操作必须脱离主线程执行 */
    private static final ExecutorService DB_EXECUTOR = Executors.newSingleThreadExecutor();

    /**
     * 防重复插入冷却期：同一来源+金额在 5 秒内只处理一次。
     * 窗口变化事件（TYPE_WINDOW_CONTENT_CHANGED）会频繁触发，
     * 支付宝成功页停留期间会收到多次事件，需要抑制。
     */
    private static final long INSERT_COOLDOWN_MS = 5000;

    /**
     * pending 指纹有效期：超过此时长视为用户放弃（捕获后未保存），
     * 允许重新捕获。confirmed 指纹永久拦截（已入账）。
     */
    private static final long PENDING_FINGERPRINT_TTL_MS = 30 * 60 * 1000;

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

    /**
     * 详情捕获确认窗口（600ms）：页面渐进加载时，金额/付款方式先渲染、备注字段后到。
     * 首次解析成功先不写队列，窗口内再次解析到同页面且备注更完整则用新的；
     * 窗口过期后由后续重试轮（600/1000/1500ms）落队列，最迟 1.5s 必捕获。
     */
    private static final long DETAIL_CONFIRM_DELAY_MS = 600;
    private volatile CapturedPaymentInfo pendingDetailInfo = null;
    private volatile long pendingDetailAt = 0;
    private volatile boolean pendingDetailFlushScheduled = false;

    /** 确认窗口过期后落队列：指纹查重（内存+DB）→ 残缺页丢弃 → 写队列。 */
    private void flushPendingDetail() {
        pendingDetailFlushScheduled = false;
        CapturedPaymentInfo confirmed = pendingDetailInfo;
        if (confirmed == null) return;
        pendingDetailInfo = null;

        String pkg = confirmed.getSourcePackage();
        // 残缺页特征：方向不明（confirm）且无备注——页面字段区根本没渲染完，
        // 这类数据拉起记账页只会让用户面对"死循环提示"。静默丢弃，等加载完整后的新一轮。
        if ("confirm".equals(confirmed.getDirection())
                && (confirmed.getNote() == null || confirmed.getNote().isEmpty())) {
            AccessibilityDiagnostics.dedup(pkg);
            Log.d(TAG, "残缺页（方向不明且无备注），静默丢弃: amount=" + confirmed.getAmount());
            return;
        }

        String fp = buildFingerprint(confirmed);
        if (CaptureDedup.isDuplicateFingerprint(fp)) {
            AccessibilityDiagnostics.dedup(pkg);
            Log.d(TAG, "指纹内存去重跳过: " + fp);
            return;
        }
        // DB 指纹兜底 + 层 2 数据比对（Bug①修复：全部移到后台线程——Room/SQLite 禁止主线程访问）
        final CapturedPaymentInfo pendingConfirm = confirmed;
        DB_EXECUTOR.execute(() -> {
            try {
                CaptureQueueDao dao = CaptureQueueDatabase
                        .getInstance(getApplicationContext())
                        .captureQueueDao();
                if (dao.findByFingerprint(fp) != null) {
                    AccessibilityDiagnostics.dedup(pkg);
                    Log.d(TAG, "指纹DB去重跳过（重启后内存已清）: " + fp);
                    return;
                }
                // 层 2 重复拦截：与已存交易（金额+商户+时间秒级）一致 → 已记录过，静默拦截
                long occurredEpoch = parseOccurredEpoch(pendingConfirm.getOccurredAt());
                if (DuplicateBlocker.isDuplicateOfStored(getApplicationContext(),
                        pendingConfirm.getAmountMinor() != null ? pendingConfirm.getAmountMinor() : 0,
                        pendingConfirm.getMerchant(), pendingConfirm.getOccurredAt(), occurredEpoch, fp)) {
                    AccessibilityDiagnostics.dedup(pkg);
                    Log.d(TAG, "重复交易拦截（已存于 transactions）: amount=" + pendingConfirm.getAmount()
                            + " merchant=" + pendingConfirm.getMerchant());
                    return;
                }
                writeToQueue(pendingConfirm);
            } catch (Exception e) {
                Log.w(TAG, "落队列检查异常", e);
            }
        });
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        sServiceConnected = true;
        AccessibilityDiagnostics.serviceConnected(this.getApplicationContext());
        Log.d(TAG, "onServiceConnected: 无障碍服务已启动");

        // 启动前台保活服务，防止 MIUI 杀后台导致主进程死亡、无障碍服务断开
        try {
            app.financemanager.capture.keepalive.CaptureKeepAliveService.start(this.getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "启动保活服务失败", e);
        }

        // 清理 7 天前已处理的捕获队列记录（acknowledged/dismissed），防止表无界增长
        DB_EXECUTOR.execute(() -> {
            try {
                int removed = CaptureQueueDatabase.getInstance(this.getApplicationContext())
                        .captureQueueDao()
                        .deleteProcessedBefore(System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000);
                if (removed > 0) Log.d(TAG, "队列清理: 删除 " + removed + " 条过期记录");
            } catch (Exception e) {
                Log.w(TAG, "队列清理失败", e);
            }
        });

        // 注意：FLAG_REPORT_VIEW_IDS 在小米澎湃 OS / HarmonyOS 等定制 ROM 上会导致
        // setServiceInfo() 抛 SecurityException，进而使服务启用即崩溃、被系统移除。
        // 采用"完整 flags → 降级 flags"策略：先尝试包含重要节点 flag，失败则降级。
        int preferredFlags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
                | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        int fallbackFlags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;

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

        // 前台心跳兜底：微信/支付宝账单详情是 H5 渐进渲染，加载完成不触发窗口切换事件，
        // 纯事件驱动会在"页面还没内容"的阶段消耗完全部机会后永远沉默。
        // 心跳每 2.5s 检查一次前台，前台为白名单 APP 时主动扫当前窗口；
        // 同页面重复扫描由指纹去重/确认窗口拦截，不会重复弹。
        mainHandler.postDelayed(heartbeatRunnable, HEARTBEAT_INTERVAL_MS);
    }

    private static final long HEARTBEAT_INTERVAL_MS = 2500;
    private final Runnable heartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                heartbeatRound++;
                AccessibilityNodeInfo active = getRootInActiveWindow();
                String pkg = active != null && active.getPackageName() != null
                        ? active.getPackageName().toString() : "";

                // activeRoot 不可用时（部分 ROM 对事件外读取有限制）遍历窗口列表兜底
                if (active == null) {
                    try {
                        for (android.view.accessibility.AccessibilityWindowInfo w : getWindows()) {
                            AccessibilityNodeInfo r = w.getRoot();
                            if (r != null && r.getPackageName() != null
                                    && WhitelistPackages.contains(r.getPackageName().toString())) {
                                active = r;
                                pkg = r.getPackageName().toString();
                                break;
                            }
                        }
                    } catch (Exception ignored) {
                    }
                }

                // 状态日志（低频）：定位心跳是否存活/节点读取是否受限
                if (heartbeatRound % 8 == 1) {
                    Log.d(TAG, "心跳#" + heartbeatRound + ": active=" + (active != null ? "OK" : "null")
                            + " pkg=" + pkg + " windows=" + (getWindows() != null ? getWindows().size() : -1));
                }

                if (WhitelistPackages.contains(pkg)) {
                    long now = android.os.SystemClock.elapsedRealtime();
                    if (now - lastHeartbeatScanAt >= HEARTBEAT_INTERVAL_MS) {
                        lastHeartbeatScanAt = now;
                        processWindow(pkg, active, true);
                        if (active != null) active.recycle();
                    }
                }
            } catch (Throwable t) {
                // 防止未捕获异常断掉心跳链
                Log.w(TAG, "心跳扫描异常: " + t);
            }
            mainHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS);
        }
    };
    private int heartbeatRound = 0;
    private volatile long lastHeartbeatScanAt = 0;

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

        Log.d(TAG, "收到事件: pkg=" + packageName + " type=" + eventType
                + " class=" + (event.getClassName() != null ? event.getClassName() : "?"));

        // 去抖：同一包名 500ms 内只处理一次，避免任务栏预览时大量事件堵塞主线程
        if (isThrottled(packageName)) return;
        markProcessed(packageName);

        AccessibilityDiagnostics.event(packageName, eventType);

        final String pkg = packageName;

        // 处理所有窗口的 root（微信交易详情可能在非焦点窗口）
        Runnable scan = () -> {
            try {
                java.util.List<android.view.accessibility.AccessibilityWindowInfo> windows = getWindows();
                int winCount = windows != null ? windows.size() : -1;
                Log.d(TAG, "scan: windows=" + winCount);
                if (windows != null) {
                    for (android.view.accessibility.AccessibilityWindowInfo w : windows) {
                        AccessibilityNodeInfo r = w.getRoot();
                        Log.d(TAG, "  window id=" + w.getId() + " type=" + w.getType() + " active=" + w.isActive() + " root=" + (r != null ? "OK" : "null"));
                        if (r != null) {
                            try { processWindow(pkg, r, true); }
                            catch (Exception ignored) {}
                        }
                    }
                }
                // 也兜底拿 active window
                AccessibilityNodeInfo activeRoot = getRootInActiveWindow();
                Log.d(TAG, "scan: activeRoot=" + (activeRoot != null ? "OK" : "null"));
                if (activeRoot != null) {
                    try { processWindow(pkg, activeRoot, true); }
                    finally { activeRoot.recycle(); }
                }
            } catch (Exception e) {
                Log.e(TAG, "scan 异常", e);
            }
        };
        scan.run();

        // 分多次重试：微信/支付宝账单详情是 H5 渐进渲染，早期 dump 常为空白且
        // 渲染完成不一定再触发内容变化事件——靠重试轮主动 dump，末轮覆盖到 6 秒（慢网）
        int[] delays = {100, 300, 600, 1000, 1500, 2500, 4000, 6000};
        for (int delay : delays) {
            mainHandler.postDelayed(() -> {
                try {
                    scan.run();
                } catch (Throwable t) {
                    // 防止单轮异常断掉整条重试链
                    Log.w(TAG, "重试轮异常: " + t);
                }
            }, delay);
        }
    }

    private void dumpNode(AccessibilityNodeInfo node, int depth, StringBuilder sb) {
        if (node == null || depth > 15) return;
        StringBuilder indent = new StringBuilder();
        for (int i = 0; i < depth; i++) indent.append("  ");
        String cls = node.getClassName() != null ? node.getClassName().toString() : "?";
        String text = node.getText() != null ? node.getText().toString() : "";
        String desc = node.getContentDescription() != null ? node.getContentDescription().toString() : "";
        sb.append(indent).append("[").append(cls).append("]");
        if (!text.isEmpty()) sb.append(" text=\"").append(text).append("\"");
        if (!desc.isEmpty()) sb.append(" desc=\"").append(desc).append("\"");
        sb.append("\n");
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                dumpNode(child, depth + 1, sb);
                child.recycle();
            }
        }
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
     * 1a. RuleBasedParser.parseBillDetail：账单/订单详情页规则（pageType=bill-detail，P1）
     * 1b. RuleBasedParser.parse：成功页规则（pageType 缺省，向后兼容）
     * 2.  PaymentParserRegistry：预置的硬编码适配器兜底
     * 3.  都不成功则跳过
     */
    private static final boolean DEBUG_DUMP_NODE_TREE = false;

    private void processWindow(String packageName, AccessibilityNodeInfo root) {
        processWindow(packageName, root, false);
    }

    private void processWindow(String packageName, AccessibilityNodeInfo root, boolean quiet) {
        // 节点树全量 dump 日志量巨大（会挤爆 logcat buffer），默认关闭；排障时置 true
        if (DEBUG_DUMP_NODE_TREE) {
            StringBuilder sb = new StringBuilder();
            dumpNode(root, 0, sb);
            Log.d(TAG, "===== 节点树开始 (" + packageName + ") =====");
            Log.d(TAG, sb.toString());
            Log.d(TAG, "===== 节点树结束 =====");
        }

        CapturedPaymentInfo info = null;

        // 策略 1a：详情页规则（优先命中，避免成功页正则误判详情页）
        app.financemanager.capture.accessibility.rules.RuleBasedParser ruleParser =
                new app.financemanager.capture.accessibility.rules.RuleBasedParser();
        try {
            info = ruleParser.parseBillDetail(this, root, packageName);
            if (info != null) {
                Log.d(TAG, "DetailPageParser 解析成功: " + packageName);
            }
        } catch (Exception e) {
            Log.d(TAG, "DetailPageParser 跳过: " + e.getMessage());
        }

        // 策略 1b：成功页规则
        if (info == null) {
            try {
                info = ruleParser.parse(this, root, packageName);
                if (info != null) {
                    Log.d(TAG, "RuleBasedParser 解析成功: " + packageName);
                }
            } catch (Exception e) {
                Log.d(TAG, "RuleBasedParser 跳过: " + e.getMessage());
            }
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

        // 去重检查（详情页走指纹；成功页走旧 CaptureDedup）
        if (info.getDirection() != null) {
            // 详情捕获确认窗口：同页面且备注更完整时更新待发数据；窗口未过期则不落队列
            long now = System.currentTimeMillis();
            CapturedPaymentInfo prev = pendingDetailInfo;
            boolean samePage = prev != null
                    && prev.getAmountMinor() != null
                    && prev.getAmountMinor().equals(info.getAmountMinor());
            if (samePage && (prev.getNote() == null || prev.getNote().isEmpty())
                    && info.getNote() != null && !info.getNote().isEmpty()) {
                pendingDetailInfo = info;
            } else if (!samePage) {
                pendingDetailInfo = info;
                pendingDetailAt = now;
            }
            if (now - pendingDetailAt < DETAIL_CONFIRM_DELAY_MS) {
                Log.d(TAG, "详情捕获确认窗口内，等待更完整数据（备注="
                        + (pendingDetailInfo.getNote() != null ? "有" : "无") + "）");
                // 重试链末轮（6000ms）之后可能没有新事件了——主动调度一次落队列，
                // 否则末轮命中的数据会永远停在确认窗口里
                if (!pendingDetailFlushScheduled) {
                    pendingDetailFlushScheduled = true;
                    long remaining = DETAIL_CONFIRM_DELAY_MS - (now - pendingDetailAt) + 50;
                    mainHandler.postDelayed(this::flushPendingDetail, Math.max(remaining, 50));
                }
                return;
            }
            flushPendingDetail();
            return;
        }
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
     *
     * 详情页（direction != null）走业务指纹去重：内存快速层（processWindow 已做）
     * + capture_fingerprint 表持久层（DB_EXECUTOR 串行，防 5 次重试穿透）。
     * 成功页保留 5 秒金额冷却（原逻辑）。
     */
    private void writeToQueue(CapturedPaymentInfo info) {
        boolean isDetail = info.getDirection() != null;
        String fp = isDetail ? buildFingerprint(info) : null;

        // 成功页：5 秒冷却（详情页由指纹去重负责，不再用金额冷却）
        if (!isDetail) {
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
        }

        DB_EXECUTOR.execute(() -> {
            try {
                CaptureQueueDao dao = CaptureQueueDatabase
                        .getInstance(this.getApplicationContext())
                        .captureQueueDao();

                // 详情页：DB 持久指纹查重 + 预占 pending 指纹
                if (isDetail) {
                    CaptureFingerprintEntity existing = dao.findByFingerprint(fp);
                    if (existing != null) {
                        long now = System.currentTimeMillis();
                        if ("confirmed".equals(existing.getStatus())) {
                            // 已确认入账：永久拦截（PRD §8.4）
                            AccessibilityDiagnostics.dedup(info.getSourcePackage());
                            Log.d(TAG, "指纹已确认入账，跳过: " + fp);
                            return;
                        }
                        if ("pending".equals(existing.getStatus())
                                && now - existing.getCreatedAt() < PENDING_FINGERPRINT_TTL_MS) {
                            // 预占期内（防同页面 5 次重试穿透）：拦截
                            AccessibilityDiagnostics.dedup(info.getSourcePackage());
                            Log.d(TAG, "指纹预占期内，跳过: " + fp);
                            return;
                        }
                        // pending 超时（用户上次捕获后未保存就放弃）→ 删除旧指纹，允许重新捕获
                        dao.deleteFingerprint(fp);
                        Log.d(TAG, "pending 指纹已过期，允许重新捕获: " + fp);
                    }
                    CaptureFingerprintEntity fpEnt = new CaptureFingerprintEntity();
                    fpEnt.setFingerprint(fp);
                    fpEnt.setSourcePackage(info.getSourcePackage());
                    fpEnt.setAmountMinor(info.getAmountMinor());
                    fpEnt.setOccurredAt(info.getOccurredAt());
                    fpEnt.setSourceOrderId(info.getOrderNo());
                    fpEnt.setStatus("pending");
                    fpEnt.setCreatedAt(System.currentTimeMillis());
                    dao.insertFingerprint(fpEnt);
                }

                String fingerprint = fp != null ? fp : buildFingerprint(info);

                CaptureQueueEntity entity = new CaptureQueueEntity();
                entity.setSourcePackage(orNull(info.getSourcePackage()));
                entity.setSourceName(orNull(info.getSourceName()));
                entity.setCaptureMethod("accessibility");
                // 详情页用真实交易时间（解析出的创建/支付时间）；成功页无时间，保留毫秒串（前端归一化）
                String occurred = info.getOccurredAt();
                entity.setOccurredAt(occurred != null && !occurred.isEmpty()
                        ? occurred : String.valueOf(System.currentTimeMillis()));
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
                entity.setNote(info.getNote());
                entity.setDirection(info.getDirection());
                entity.setOriginalAmountMinor(info.getOriginalAmountMinor());
                entity.setDiscountMinor(info.getDiscountMinor());
                entity.setFeeMinor(info.getFeeMinor());
                entity.setTargetAccountHint(info.getTargetAccountHint());
                entity.setCreatedAt(System.currentTimeMillis());

                dao.insert(entity);

                AccessibilityDiagnostics.queueInsert(info.getSourcePackage(), entity.getId());
                PaymentCapturePlugin.notifyCandidate(entity);
                // 直接拉起 APP，打开记账页面，自动填好金额和备注（最小闭环：检测金额 → 记账页预填）
                // 正金额（收入/转账/退款）也拉起，由用户在记账页确认方向（不自动落账）
                PaymentCapturePlugin.launchRecordForCapture(getApplicationContext(), entity);

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

    /**
     * 业务指纹（PRD §8.2）：优先订单号/户号/交易单号；否则 hash(金额+时间+商户)。
     * 详情页去重键；购物与支付宝双通道共用 hash 键，确保跨体系指纹一致。
     */
    private static String buildFingerprint(CapturedPaymentInfo info) {
        String orderId = info.getOrderNo();
        if (orderId != null && !orderId.isEmpty()) {
            return "order:" + orderId;
        }
        StringBuilder base = new StringBuilder();
        base.append(info.getAmountMinor() != null ? info.getAmountMinor() : "0");
        base.append('|');
        base.append(info.getOccurredAt() != null ? info.getOccurredAt() : "");
        base.append('|');
        base.append(info.getMerchant() != null ? info.getMerchant() : "");
        return "tx:" + Integer.toHexString(base.toString().hashCode());
    }

    /** ISO 时间 → epoch 毫秒（失败 -1）。 */
    private static long parseOccurredEpoch(String iso) {
        if (iso == null || iso.isEmpty()) return -1;
        String[] patterns = {"yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss.SSS"};
        for (String pattern : patterns) {
            try {
                SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
                f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                Date d = f.parse(iso);
                if (d != null) return d.getTime();
            } catch (Exception ignored) {
            }
        }
        return -1;
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
        sServiceConnected = false;
        mainHandler.removeCallbacks(heartbeatRunnable);
        AccessibilityDiagnostics.serviceDestroyed(this.getApplicationContext());
        // 停止前台保活服务（无障碍禁用时不再保活）
        try {
            app.financemanager.capture.keepalive.CaptureKeepAliveService.stop(this.getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "停止保活服务失败", e);
        }
        super.onDestroy();
        Log.d(TAG, "onDestroy: 无障碍服务已销毁");
    }

    public String getLastSourcePackage() { return lastSourcePackage; }
    public String getLastSourceName() { return lastSourceName; }
}