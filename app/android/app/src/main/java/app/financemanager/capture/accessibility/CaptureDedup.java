package app.financemanager.capture.accessibility;

import androidx.annotation.Nullable;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 捕获事件去重（内存快速层）。
 *
 * 两套键：
 * 1. isDuplicate(pkg, amountMinor)：兼容旧链路（通知/分享），key = 包名 + 金额 + 分钟级时间桶，
 *    窗口 = 2 分钟。仅作为旧链路的快速去重，不用于账单详情页。
 * 2. isDuplicateFingerprint(fingerprint)：P1 账单详情链路的内存第一道防线，
 *    key = 业务指纹（orderId / hash(金额+时间+商户)），窗口 = 5 分钟。
 *    持久查重在 capture_fingerprint 表（CaptureQueueDao）完成，内存层只防同一页面
 *    多次窗口事件穿透（5 次重试），避免频繁 DB 查询。
 *
 * 同一次支付页面动画（支付宝成功页通常触发 5-6 次内容变化）在同一窗口内 → 只留第一条。
 */
public final class CaptureDedup {

    private static final long DEDUP_WINDOW_MS = 2 * 60 * 1000;
    private static final long DEDUP_BUCKET_MS = 60_000;
    private static final long FINGERPRINT_WINDOW_MS = 5 * 60 * 1000;

    private static final Map<String, Long> SEEN = new ConcurrentHashMap<>();
    private static final Map<String, Long> FINGERPRINT_SEEN = new ConcurrentHashMap<>();

    /** 仅检查不标记。与 {@link #markSeen} 配对：落库成功后再标记，插入失败可立即重试。 */
    public static boolean hasSeen(@Nullable String sourcePackage, @Nullable Long amountMinor) {
        long now = System.currentTimeMillis();
        String key = makeKey(sourcePackage, amountMinor, now);
        Long lastSeen = SEEN.get(key);
        return lastSeen != null && (now - lastSeen) < DEDUP_WINDOW_MS;
    }

    /** 标记本分钟桶已见（配合 {@link #hasSeen}：确认写入队列成功后调用）。 */
    public static void markSeen(@Nullable String sourcePackage, @Nullable Long amountMinor) {
        long now = System.currentTimeMillis();
        SEEN.put(makeKey(sourcePackage, amountMinor, now), now);
        cleanup(now);
    }

    /** 兼容旧调用方（无障碍链路）：检查并立即标记。通知/分享链路请用 hasSeen + markSeen 对。 */
    public static boolean isDuplicate(@Nullable String sourcePackage, @Nullable Long amountMinor) {
        if (hasSeen(sourcePackage, amountMinor)) return true;
        markSeen(sourcePackage, amountMinor);
        return false;
    }

    /**
     * 按业务指纹去重（内存层，5 分钟窗口）。
     * 用于账单详情页链路，作为 DB 持久查重前的第一道防线。
     */
    public static boolean isDuplicateFingerprint(String fingerprint) {
        if (fingerprint == null || fingerprint.isEmpty()) return false;
        long now = System.currentTimeMillis();
        Long lastSeen = FINGERPRINT_SEEN.get(fingerprint);
        if (lastSeen != null && (now - lastSeen) < FINGERPRINT_WINDOW_MS) {
            return true;
        }
        FINGERPRINT_SEEN.put(fingerprint, now);
        cleanupFingerprint(now);
        return false;
    }

    private static String makeKey(@Nullable String pkg, @Nullable Long amt, long now) {
        if (pkg == null) pkg = "unknown";
        if (amt == null) return pkg + ":unknown:" + (now / DEDUP_BUCKET_MS);
        return pkg + ":" + amt + ":" + (now / DEDUP_BUCKET_MS);
    }

    private static void cleanup(long now) {
        if (SEEN.size() < 1000) return;
        SEEN.entrySet().removeIf(e -> (now - e.getValue()) > DEDUP_WINDOW_MS * 2);
    }

    private static void cleanupFingerprint(long now) {
        if (FINGERPRINT_SEEN.size() < 1000) return;
        FINGERPRINT_SEEN.entrySet().removeIf(e -> (now - e.getValue()) > FINGERPRINT_WINDOW_MS * 2);
    }
}