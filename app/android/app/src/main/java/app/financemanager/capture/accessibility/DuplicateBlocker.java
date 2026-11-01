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
                                              String merchant, String occurredAtIso,
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

        SQLiteDatabase db = null;
        Cursor cursor = null;
        try {
            db = SQLiteDatabase.openDatabase(
                    context.getDatabasePath("finance_managerSQLite.db").getAbsolutePath(),
                    null, SQLiteDatabase.OPEN_READONLY);
            cursor = db.rawQuery(
                    "SELECT occurred_at FROM transactions "
                            + "WHERE amount_minor = ? AND status = 'posted' AND merchant = ? LIMIT 20",
                    new String[]{String.valueOf(amountMinor), merchant == null ? "" : merchant.trim()});
            while (cursor != null && cursor.moveToNext()) {
                String storedIso = cursor.getString(0);
                long storedMs = parseEpochMs(storedIso);
                if (storedMs <= 0) continue;
                if (Math.abs(storedMs - center) <= TIME_TOLERANCE_MS) {
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
