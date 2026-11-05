package app.financemanager.capture.accessibility;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 重复交易拦截（PRD 层 2）。
 *
 * 捕获的账单若与已存交易完全一致（实付金额 + 商户 + 发生时间秒级相等），
 * 判定为已记录过 → 拦截，不再写入队列/跳转记账页。
 * 典型场景：用户在查账补录时反复点开同笔账单详情。
 *
 * 开关：SharedPreferences capture_prefs.duplicate_block_enabled（默认开），
 * 由前端设置页通过 PaymentCapturePlugin.setDuplicateBlockEnabled 控制。
 *
 * 比对口径：
 * - amount_minor 完全相等（实付金额；原价/优惠不参与）
 * - merchant 相等（trim 后；任一方为空则跳过商户条件——仅金额+时间不拦截）
 * - occurred_at 毫秒相等（时区无关，格式差异容忍 ±1 秒）
 */
public final class DuplicateBlocker {

    private static final String TAG = "DuplicateBlocker";
    private static final String PREFS_NAME = "capture_prefs";
    private static final String KEY_ENABLED = "duplicate_block_enabled";
    private static final long TIME_TOLERANCE_MS = 1000;

    private DuplicateBlocker() {}

    public static boolean isEnabled(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getBoolean(KEY_ENABLED, true);
        } catch (Exception e) {
            return true;
        }
    }

    /**
     * 检查该笔捕获是否与已存交易重复。
     *
     * @param occurredAtEpochMs 捕获发生时间（epoch 毫秒，可能 -1 表示无法解析）
     * @return true = 已存在相同交易，应拦截
     */
    public static boolean isDuplicateOfStored(Context context, long amountMinor,
                                              String merchant, String note, String occurredAtIso,
                                              long occurredAtEpochMs, String fingerprint) {
        if (!isEnabled(context)) return false;
        if (amountMinor <= 0) return false;

        long center = occurredAtEpochMs;
        if (center <= 0 && occurredAtIso != null && occurredAtIso.length() >= 10) {
            try {
                // 页面时间是本地时间（无时区后缀）——必须用本地时区解析，
                // 与库内 UTC 时间对齐（Bug②修复：之前按 UTC 解析偏差 8 小时）
                SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
                Date d = f.parse(occurredAtIso);
                if (d != null) center = d.getTime();
            } catch (Exception ignored) {
            }
        }
        if (center <= 0) return false;

        // 时间窗 ±60s（ISO UTC 字符串比较），同金额候选取回后在 Java 里做商户/备注比对
        SimpleDateFormat utc = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
        utc.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        String fromIso = utc.format(new java.util.Date(center - WINDOW_MS));
        String toIso = utc.format(new java.util.Date(center + WINDOW_MS));

        SQLiteDatabase db = null;
        Cursor cursor = null;
        try {
            db = SQLiteDatabase.openDatabase(
                    context.getDatabasePath("finance_managerSQLite.db").getAbsolutePath(),
                    null, SQLiteDatabase.OPEN_READONLY);
            cursor = db.rawQuery(
                    "SELECT occurred_at, merchant, note FROM transactions "
                            + "WHERE amount_minor = ? AND status = 'posted' "
                            + "AND occurred_at BETWEEN ? AND ? LIMIT 50",
                    new String[]{String.valueOf(amountMinor), fromIso, toIso});
            while (cursor != null && cursor.moveToNext()) {
                String storedIso = cursor.getString(0);
                String storedMerchant = cursor.getString(1);
                String storedNote = cursor.getString(2);
                long storedMs = parseEpochMs(storedIso);
                if (storedMs <= 0) continue;
                if (Math.abs(storedMs - center) > TIME_TOLERANCE_MS) continue;
                if (matchesEvidence(merchant, storedMerchant, note, storedNote)) {
                    Log.i(TAG, "命中已存交易：amount=" + amountMinor
                            + " merchant=" + merchant + " occurred=" + storedIso);
                    return true;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "重复交易检查失败（不拦截）", e);
        } finally {
            if (cursor != null) cursor.close();
            if (db != null) db.close();
        }
        return false;
    }

    /** 时间匹配窗：保存的 occurred_at 透传自捕获，正常秒级一致；±60s 容忍手动补录。 */
    private static final long WINDOW_MS = 60 * 1000;

    /**
     * 重复证据判定：商户相等或双向包含（"美团" ⊂ "美团外卖"），
     * 或备注双向包含（实测 2026-11-06：保存时商户为空、重捕解析出"天猫"，
     * 仅商户比对拦不住 → 用备注"黄桃罐头…"兜底）。
     */
    private static boolean matchesEvidence(String capMerchant, String storedMerchant,
                                           String capNote, String storedNote) {
        String cm = capMerchant == null ? "" : capMerchant.trim();
        String sm = storedMerchant == null ? "" : storedMerchant.trim();
        if (!cm.isEmpty() && !sm.isEmpty()
                && (cm.equals(sm) || sm.contains(cm) || cm.contains(sm))) {
            return true;
        }
        String cn = capNote == null ? "" : capNote.trim();
        String sn = storedNote == null ? "" : storedNote.trim();
        return !cn.isEmpty() && !sn.isEmpty()
                && (sn.contains(cn) || cn.contains(sn));
    }

    /** 库内时间字符串（UTC ISO）→ epoch 毫秒；失败 -1。 */
    private static long parseEpochMs(String iso) {
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
}
