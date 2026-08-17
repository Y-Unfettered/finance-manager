package app.financemanager.capture.notification;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 通知监听服务诊断收集器。
 *
 * 与 AccessibilityDiagnostics 结构对称，专门记录通知监听通道的每一步。
 */
public final class NotificationDiagnostics {

    private static final String PREFS = "notif_diag";
    private static final int RING_SIZE = 200;

    private static final ConcurrentLinkedDeque<String> RING = new ConcurrentLinkedDeque<>();

    private static final AtomicLong CONNECTED = new AtomicLong(0);
    private static final AtomicLong DISCONNECTED = new AtomicLong(0);
    private static final AtomicLong NOTIF_TOTAL = new AtomicLong(0);
    private static final AtomicLong NO_KEYWORD = new AtomicLong(0);
    private static final AtomicLong NO_AMOUNT = new AtomicLong(0);
    private static final AtomicLong PARSED = new AtomicLong(0);
    private static final AtomicLong DEDUP = new AtomicLong(0);
    private static final AtomicLong Q_INSERT = new AtomicLong(0);
    private static final AtomicLong Q_FAIL = new AtomicLong(0);

    private NotificationDiagnostics() {}

    public static void listenerConnected(Context ctx) {
        CONNECTED.incrementAndGet();
        record("CONNECTED", "", "", "通知监听已连接");
        persistLong(ctx, "last_connected_at", System.currentTimeMillis());
    }

    public static void listenerDisconnected(Context ctx) {
        DISCONNECTED.incrementAndGet();
        record("DISCONNECTED", "", "", "通知监听已断开");
        persistLong(ctx, "last_disconnected_at", System.currentTimeMillis());
    }

    public static void notification(String pkg, String title, String text) {
        NOTIF_TOTAL.incrementAndGet();
        String safeTitle = title != null ? title : "";
        String safeText = text != null ? text : "";
        String snippet = (safeTitle + " " + safeText).length() > 60
                ? (safeTitle + " " + safeText).substring(0, 60)
                : (safeTitle + " " + safeText);
        record("NOTIF", pkg, "", "title=" + safeTitle.substring(0, Math.min(safeTitle.length(), 30))
                + " text=" + safeText.substring(0, Math.min(safeText.length(), 30)));
    }

    public static void noKeyword(String pkg, String snippet) {
        NO_KEYWORD.incrementAndGet();
        record("NO_KEYWORD", pkg, "", snippet != null ? snippet : "");
    }

    public static void noAmount(String pkg) {
        NO_AMOUNT.incrementAndGet();
        record("NO_AMOUNT", pkg, "", "未提取到金额");
    }

    public static void parsed(String pkg, String amount) {
        PARSED.incrementAndGet();
        record("PARSED", pkg, "", "金额=" + amount);
    }

    public static void dedup(String pkg) {
        DEDUP.incrementAndGet();
        record("DEDUP", pkg, "", "去重跳过");
    }

    public static void queueInsert(String pkg, long id) {
        Q_INSERT.incrementAndGet();
        record("Q_INSERT", pkg, "", "id=" + id);
    }

    public static void queueFail(String pkg, String err) {
        Q_FAIL.incrementAndGet();
        record("Q_FAIL", pkg, "", err != null ? err : "writeToQueue 异常");
    }

    // ---------- 导出 ----------

    public static long getConnected() { return CONNECTED.get(); }
    public static long getDisconnected() { return DISCONNECTED.get(); }
    public static long getNotifTotal() { return NOTIF_TOTAL.get(); }
    public static long getNoKeyword() { return NO_KEYWORD.get(); }
    public static long getNoAmount() { return NO_AMOUNT.get(); }
    public static long getParsed() { return PARSED.get(); }
    public static long getDedup() { return DEDUP.get(); }
    public static long getQueueInsert() { return Q_INSERT.get(); }
    public static long getQueueFail() { return Q_FAIL.get(); }

    public static List<String> getRing() {
        synchronized (RING) {
            return new LinkedList<>(RING);
        }
    }

    public static long getLastConnectedAt(Context ctx) {
        return getLong(ctx, "last_connected_at", 0);
    }

    public static long getLastDisconnectedAt(Context ctx) {
        return getLong(ctx, "last_disconnected_at", 0);
    }

    public static void reset(Context ctx) {
        CONNECTED.set(0); DISCONNECTED.set(0); NOTIF_TOTAL.set(0);
        NO_KEYWORD.set(0); NO_AMOUNT.set(0); PARSED.set(0);
        DEDUP.set(0); Q_INSERT.set(0); Q_FAIL.set(0);
        synchronized (RING) { RING.clear(); }
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (sp != null) sp.edit().clear().apply();
    }

    private static void record(String phase, String pkg, String extra, String detail) {
        String entry = System.currentTimeMillis() + "|" + phase + "|"
                + (pkg != null ? pkg : "") + "|" + (extra != null ? extra : "")
                + "|" + (detail != null ? detail : "");
        RING.addLast(entry);
        trimRing();
    }

    private static void trimRing() {
        while (RING.size() > RING_SIZE) {
            RING.pollFirst();
        }
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
}