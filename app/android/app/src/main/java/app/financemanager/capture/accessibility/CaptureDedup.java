package app.financemanager.capture.accessibility;

import androidx.annotation.Nullable;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 捕获事件去重。
 *
 * key = 包名 + 金额 + 分钟级时间桶。
 * 窗口 = 2 分钟（过期自动清理）。
 *
 * 同一次支付页面动画（支付宝成功页通常触发 5-6 次内容变化）在同一分钟桶内 → 只留第一条。
 * 两次不同时间的支付，即使金额相同，只要不在同一分钟内 → 都通过。
 * 同一分钟内两次同金额支付 → 被去重（概率极低，可接受）。
 */
public final class CaptureDedup {

    private static final long DEDUP_WINDOW_MS = 2 * 60 * 1000;
    private static final long DEDUP_BUCKET_MS = 60_000;

    private static final Map<String, Long> SEEN = new ConcurrentHashMap<>();

    public static boolean isDuplicate(@Nullable String sourcePackage, @Nullable Long amountMinor) {
        long now = System.currentTimeMillis();
        String key = makeKey(sourcePackage, amountMinor, now);
        Long lastSeen = SEEN.get(key);
        if (lastSeen != null && (now - lastSeen) < DEDUP_WINDOW_MS) {
            return true;
        }
        SEEN.put(key, now);
        cleanup(now);
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

    public static void reset() {
        SEEN.clear();
    }
}