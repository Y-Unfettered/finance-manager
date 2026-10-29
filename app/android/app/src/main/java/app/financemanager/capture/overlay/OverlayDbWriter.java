package app.financemanager.capture.overlay;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;

import app.financemanager.local.capture.CaptureQueueEntity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

/**
 * 原生直接写入前端 SQLite 数据库（finance_manager.db）。
 * 不依赖 WebView，点"记一笔"时直接 INSERT transactions + entries。
 */
public class OverlayDbWriter {

    private static final String TAG = "OverlayDbWriter";
    private static final String DB_NAME = "finance_managerSQLite.db";

    /** 删除所有 capture_source='overlay' 的测试数据（清理用） */
    public static void cleanupTestData(Context context) {
        SQLiteDatabase db = null;
        try {
            String dbPath = context.getDatabasePath(DB_NAME).getAbsolutePath();
            db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READWRITE);
            int n1 = db.delete("entries", "transaction_id IN (SELECT id FROM transactions WHERE capture_source='overlay')", null);
            int n2 = db.delete("transactions", "capture_source='overlay'", null);
            Log.d("OverlayDbWriter", "清理测试数据: entries=" + n1 + " transactions=" + n2);
        } catch (Exception e) {
            Log.e("OverlayDbWriter", "清理失败", e);
        } finally {
            if (db != null) try { db.close(); } catch (Exception ignored) {}
        }
    }

    private final Context appContext;

    public OverlayDbWriter(Context context) {
        this.appContext = context.getApplicationContext();
    }

    /**
     * 直接入账：插入 transactions + entries。
     * @param entity 捕获到的支付记录
     * @param categoryId 用户选中的分类 ID（null 则用第一个支出分类）
     * @param accountId 用户选中的账户 ID（null 则用第一个账户）
     */
    public synchronized boolean commit(CaptureQueueEntity entity, String categoryId, String accountId) {
        SQLiteDatabase db = null;
        try {
            String dbPath = appContext.getDatabasePath(DB_NAME).getAbsolutePath();
            Log.d(TAG, "打开数据库: " + dbPath);
            db = SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READWRITE);

            SharedPreferences sp = appContext.getSharedPreferences("overlay_cache", Context.MODE_PRIVATE);
            String ledgerId = sp.getString("ledger_id", null);
            if (ledgerId == null || ledgerId.isEmpty()) {
                // 列出所有 ledger，打日志看名字
                Cursor cAll = db.rawQuery("SELECT id, name FROM ledgers", null);
                while (cAll.moveToNext()) {
                    Log.d(TAG, "ledger: id=" + cAll.getString(0) + " name=" + cAll.getString(1));
                }
                cAll.close();
                // 按名字查"日常账本"
                Cursor c = db.rawQuery("SELECT id FROM ledgers WHERE name=? LIMIT 1", new String[]{"日常账本"});
                if (c.moveToFirst()) ledgerId = c.getString(0);
                c.close();
            }
            if (ledgerId == null || ledgerId.isEmpty()) {
                // 兜底：交易最多的账本
                Cursor c = db.rawQuery(
                    "SELECT ledger_id FROM entries GROUP BY ledger_id ORDER BY COUNT(*) DESC LIMIT 1", null);
                if (c.moveToFirst()) ledgerId = c.getString(0);
                c.close();
            }
            if (ledgerId == null || ledgerId.isEmpty()) {
                Log.e(TAG, "找不到 ledger_id");
                return false;
            }
            Log.d(TAG, "使用 ledger_id: " + ledgerId);

            // 如果没指定分类，找第一个支出分类
            if (categoryId == null) {
                Cursor c = db.rawQuery("SELECT id FROM categories WHERE ledger_id=? AND kind='expense' LIMIT 1", new String[]{ledgerId});
                if (c.moveToFirst()) categoryId = c.getString(0);
                c.close();
            }
            // 如果没指定账户，找第一个账户
            if (accountId == null) {
                Cursor c = db.rawQuery("SELECT id FROM accounts WHERE ledger_id=? LIMIT 1", new String[]{ledgerId});
                if (c.moveToFirst()) accountId = c.getString(0);
                c.close();
            }
            if (categoryId == null || accountId == null) {
                Log.e(TAG, "分类或账户为空: cat=" + categoryId + " acc=" + accountId);
                return false;
            }

            long amountMinor = entity.getAmountMinor() != null ? entity.getAmountMinor() : 0L;
            if (amountMinor <= 0) {
                Log.e(TAG, "金额无效: " + amountMinor);
                return false;
            }

            String now = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(new Date());
            String occurredAt = entity.getOccurredAt();
            if (occurredAt == null || occurredAt.isEmpty()) occurredAt = now;

            String txId = UUID.randomUUID().toString();
            String entryId = UUID.randomUUID().toString();

            db.beginTransaction();
            try {
                ContentValues tx = new ContentValues();
                tx.put("id", txId);
                tx.put("ledger_id", ledgerId);
                tx.put("type", "expense");
                tx.put("status", "posted");
                tx.put("amount_minor", amountMinor);
                tx.put("currency", "CNY");
                tx.put("occurred_at", occurredAt);
                tx.put("merchant", entity.getMerchant() != null ? entity.getMerchant() : "");
                tx.put("note", "");
                tx.put("capture_source", "overlay");
                tx.put("parser_version", "native-0.1");
                tx.put("created_at", now);
                tx.put("updated_at", now);
                db.insert("transactions", null, tx);

                ContentValues entry = new ContentValues();
                entry.put("id", entryId);
                entry.put("ledger_id", ledgerId);
                entry.put("transaction_id", txId);
                entry.put("account_id", accountId);
                entry.put("category_id", categoryId);
                entry.put("side", "debit");
                entry.put("amount_minor", amountMinor);
                entry.put("created_at", now);
                db.insert("entries", null, entry);

                db.setTransactionSuccessful();
                Log.d(TAG, "入账成功: txId=" + txId + " amount=" + amountMinor + " cat=" + categoryId + " acc=" + accountId);
                return true;
            } finally {
                db.endTransaction();
            }
        } catch (Exception e) {
            Log.e(TAG, "入账失败", e);
            return false;
        } finally {
            if (db != null) try { db.close(); } catch (Exception ignored) {}
        }
    }
}
