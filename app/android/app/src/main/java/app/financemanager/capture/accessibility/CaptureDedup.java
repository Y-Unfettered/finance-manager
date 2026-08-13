package app.financemanager.capture.accessibility;

import androidx.annotation.Nullable;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 捕获事件去重。
 *
 * 策略：相同 sourcePackage + amountMinor 在 60 秒内视为重复。
 * 使用 Map<key, firstSeenTimestamp> 存储最近一次捕获时间戳。
 */
public final class CaptureDedup {

    private static final long DEDUP_WINDOW_MS = 60_000;

    /** key = "package:amountMinor"，value = 首次捕获时间戳 */
    private static final Map<String, Long> SEEN = new ConcurrentHashMap<>();

    /**
     * 检查是否为重复事件。
     * @return true 表示重复（应跳过），false 表示新事件（应入库）
     */
    public static boolean isDuplicate(@Nullable String sourcePackage, @Nullable Long amountMinor) {
        String key = makeKey(sourcePackage, amountMinor);
        long now = System.currentTimeMillis();
        Long lastSeen = SEEN.get(key);
        if (lastSeen != null && (now - lastSeen) < DEDUP_WINDOW_MS) {
            return true;
        }
        SEEN.put(key, now);
        cleanup(now);
        return false;
    }

    private static String makeKey(@Nullable String pkg, @Nullable Long amt) {
        if (pkg == null) pkg = "unknown";
        if (amt == null) return pkg + ":unknown";
        return pkg + ":" + amt;
    }

    private static void cleanup(long now) {
        if (SEEN.size() < 1000) return;
        SEEN.entrySet().removeIf(e -> (now - e.getValue()) > DEDUP_WINDOW_MS * 2);
    }
}