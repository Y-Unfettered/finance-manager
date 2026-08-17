package app.financemanager.capture.accessibility;

import android.content.Context;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityEvent;

import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 无障碍服务诊断收集器。
 *
 * 目的：把无障碍服务每一步的运行情况暴露给前端，用于排查"为什么没识别到支付"。
 *
 * 两类数据：
 * 1. 持久化指标（SharedPreferences）
 *    - 服务最后连接/销毁时间、重启次数、各阶段累计计数
 *    - 用于判断"服务有没有被系统杀死"
 * 2. 内存环形日志（ring buffer，最多 200 条）
 *    - 每一条记录一个关键节点（收到事件、root=null、文本为空、无关键词、无金额、解析成功、去重、写库）
 *    - 用于实时排查"为什么没识别到"
 *
 * 线程安全：所有写路径用 AtomicLong / ConcurrentLinkedDeque，SharedPreferences 仅在主线程/服务生命周期回调中写。
 *
 * 注意：进程被杀死后，内存数据（计数 + ring buffer）全部清零；
 * 而 SharedPreferences 里的时间戳/重启次数能存活。所以"计数突然归零"本身就是诊断信号——
 * 说明进程被杀。
 */
public final class AccessibilityDiagnostics {

    private static final String PREFS = "a11y_diag";
    private static final int RING_SIZE = 200;

    private static final ConcurrentLinkedDeque<String> RING = new ConcurrentLinkedDeque<>();
    private static final ConcurrentMap<String, PackageStats> PER_PKG = new java.util.concurrent.ConcurrentHashMap<>();

    // ---------- 内存计数 ----------
    private static final AtomicLong S_CONNECTED = new AtomicLong(0);
    private static final AtomicLong S_DESTROYED = new AtomicLong(0);
    private static final AtomicLong EVENT_TOTAL = new AtomicLong(0);
    private static final AtomicLong EVT_WINDOW_STATE = new AtomicLong(0);
    private static final AtomicLong EVT_WINDOW_CONTENT = new AtomicLong(0);
    private static final AtomicLong ROOT_NULL = new AtomicLong(0);
    private static final AtomicLong TEXT_EMPTY = new AtomicLong(0);
    private static final AtomicLong NO_KEYWORD = new AtomicLong(0);
    private static final AtomicLong NO_AMOUNT = new AtomicLong(0);
    private static final AtomicLong PARSED = new AtomicLong(0);
    private static final AtomicLong DEDUP = new AtomicLong(0);
    private static final AtomicLong Q_INSERT = new AtomicLong(0);
    private static final AtomicLong Q_FAIL = new AtomicLong(0);
    private static final AtomicLong NO_ADAPTER = new AtomicLong(0);

    private static final AtomicReference<String> LAST_FAIL_REASON = new AtomicReference<>();

    private static final Object TS_LOCK = new Object();

    private AccessibilityDiagnostics() {}

    // ================================================================
    // 对外便捷方法（无障碍服务调用）
    // ================================================================

    public static void serviceConnected(Context ctx) {
        S_CONNECTED.incrementAndGet();
        record("SERVICE_CONNECTED", "", 0, "无障碍服务已连接");
        persistLong(ctx, "last_connected_at", System.currentTimeMillis());
        incrementRestartCount(ctx);
    }

    public static void serviceDestroyed(Context ctx) {
        S_DESTROYED.incrementAndGet();
        record("SERVICE_DESTROYED", "", 0, "无障碍服务已销毁");
        persistLong(ctx, "last_destroyed_at", System.currentTimeMillis());
    }

    public static void event(String pkg, int eventType) {
        EVENT_TOTAL.incrementAndGet();
        if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            EVT_WINDOW_STATE.incrementAndGet();
        } else if (eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            EVT_WINDOW_CONTENT.incrementAndGet();
        }
        record("EVENT", pkg, eventType, "");
        touchPkg(pkg, "events");
    }

    public static void rootNull(String pkg) {
        ROOT_NULL.incrementAndGet();
        record("ROOT_NULL", pkg, 0, "getRootInActiveWindow() 返回 null");
        LAST_FAIL_REASON.set("root=null");
    }

    public static void getRootRetry(int attempts, boolean success) {
        record("ROOT_RETRY", "", 0, "attempts=" + attempts + " success=" + success);
    }

    public static void getRootFallback(String strategy) {
        record("ROOT_FALLBACK", "", 0, "fallback=" + (strategy != null ? strategy : "none"));
    }

    public static void noAdapter(String pkg) {
        NO_ADAPTER.incrementAndGet();
        record("NO_ADAPTER", pkg, 0, "无解析器");
        LAST_FAIL_REASON.set("no_adapter:" + pkg);
    }

    public static void textEmpty(String pkg) {
        TEXT_EMPTY.incrementAndGet();
        record("TEXT_EMPTY", pkg, 0, "extractVisibleText 返回空");
        LAST_FAIL_REASON.set("text_empty");
    }

    public static void noKeyword(String pkg, String snippet) {
        NO_KEYWORD.incrementAndGet();
        String safe = snippet != null && snippet.length() > 80 ? snippet.substring(0, 80) : snippet;
        record("NO_KEYWORD", pkg, 0, "无成功关键词: " + safe);
        LAST_FAIL_REASON.set("no_keyword:" + safe);
    }

    public static void noAmount(String pkg) {
        NO_AMOUNT.incrementAndGet();
        record("NO_AMOUNT", pkg, 0, "未提取到金额");
        LAST_FAIL_REASON.set("no_amount");
    }

    public static void parsed(String pkg, String amount, String merchant) {
        PARSED.incrementAndGet();
        touchPkg(pkg, "parsed");
        record("PARSED", pkg, 0, "金额=" + amount + " 商户=" + merchant);
    }

    public static void dedup(String pkg) {
        DEDUP.incrementAndGet();
        record("DEDUP", pkg, 0, "去重跳过");
    }

    public static void queueInsert(String pkg, long id) {
        Q_INSERT.incrementAndGet();
        record("Q_INSERT", pkg, 0, "id=" + id);
    }

    public static void queueFail(String pkg, String err) {
        Q_FAIL.incrementAndGet();
        record("Q_FAIL", pkg, 0, err != null ? err : "writeToQueue 异常");
    }

    // ================================================================
    // 导出（插件读取）
    // ================================================================

    /** 所有计数快照（内存，进程重启后清零）。 */
    public static long getServiceConnected() { return S_CONNECTED.get(); }
    public static long getServiceDestroyed() { return S_DESTROYED.get(); }
    public static long getEventTotal() { return EVENT_TOTAL.get(); }
    public static long getEvtWindowState() { return EVT_WINDOW_STATE.get(); }
    public static long getEvtWindowContent() { return EVT_WINDOW_CONTENT.get(); }
    public static long getRootNull() { return ROOT_NULL.get(); }
    public static long getTextEmpty() { return TEXT_EMPTY.get(); }
    public static long getNoKeyword() { return NO_KEYWORD.get(); }
    public static long getNoAmount() { return NO_AMOUNT.get(); }
    public static long getParsed() { return PARSED.get(); }
    public static long getDedup() { return DEDUP.get(); }
    public static long getQueueInsert() { return Q_INSERT.get(); }
    public static long getQueueFail() { return Q_FAIL.get(); }
    public static long getNoAdapter() { return NO_ADAPTER.get(); }
    public static String getLastFailReason() { return LAST_FAIL_REASON.get(); }

    /** 内存环形日志（最新 200 条）。 */
    public static List<String> getRing() {
        synchronized (RING) {
            return new LinkedList<>(RING);
        }
    }

    /** 每包统计。 */
    public static List<String> getPerPkg() {
        List<String> out = new LinkedList<>();
        for (Map.Entry<String, PackageStats> e : PER_PKG.entrySet()) {
            out.add(e.getKey() + ":" + e.getValue().events + ":" + e.getValue().parsed);
        }
        return out;
    }

    // ---------- 持久化（SharedPreferences） ----------

    public static long getLastConnectedAt(Context ctx) {
        return getLong(ctx, "last_connected_at", 0);
    }

    public static long getLastDestroyedAt(Context ctx) {
        return getLong(ctx, "last_destroyed_at", 0);
    }

    public static long getRestartCount(Context ctx) {
        return getLong(ctx, "restart_count", 0);
    }

    public static void reset(Context ctx) {
        S_CONNECTED.set(0); S_DESTROYED.set(0);
        EVENT_TOTAL.set(0); EVT_WINDOW_STATE.set(0); EVT_WINDOW_CONTENT.set(0);
        ROOT_NULL.set(0); TEXT_EMPTY.set(0); NO_KEYWORD.set(0); NO_AMOUNT.set(0);
        PARSED.set(0); DEDUP.set(0); Q_INSERT.set(0); Q_FAIL.set(0); NO_ADAPTER.set(0);
        LAST_FAIL_REASON.set(null);
        PER_PKG.clear();
        synchronized (RING) {
            RING.clear();
        }
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (sp != null) sp.edit().clear().apply();
    }

    // ================================================================
    // 内部实现
    // ================================================================

    private static void record(String phase, String pkg, int eventType, String detail) {
        String safePkg = pkg != null ? pkg : "";
        String safeDetail = detail != null ? detail : "";
        String entry = System.currentTimeMillis() + "|" + phase + "|" + safePkg
                + "|" + eventType + "|" + safeDetail;
        RING.addLast(entry);
        trimRing();
    }

    private static void trimRing() {
        while (RING.size() > RING_SIZE) {
            RING.pollFirst();
        }
    }

    private static void touchPkg(String pkg, String field) {
        if (pkg == null || pkg.isEmpty()) return;
        PackageStats stats = PER_PKG.computeIfAbsent(pkg, k -> new PackageStats());
        if ("events".equals(field)) stats.events++;
        else if ("parsed".equals(field)) stats.parsed++;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void persistLong(Context ctx, String key, long value) {
        try {
            prefs(ctx).edit().putLong(key, value).apply();
        } catch (Exception ignored) {}
    }

    private static long getLong(Context ctx, String key, long def) {
        try {
            return prefs(ctx).getLong(key, def);
        } catch (Exception e) {
            return def;
        }
    }

    private static void incrementRestartCount(Context ctx) {
        long c = getLong(ctx, "restart_count", 0);
        persistLong(ctx, "restart_count", c + 1);
    }

    /** 每包统计。 */
    private static final class PackageStats {
        long events;
        long parsed;
    }
}