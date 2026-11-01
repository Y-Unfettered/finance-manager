package app.financemanager.local.capture;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;
import androidx.room.migration.Migration;
import androidx.sqlite.db.SupportSQLiteDatabase;

@Database(entities = {CaptureQueueEntity.class, CaptureFingerprintEntity.class}, version = 5, exportSchema = false)
public abstract class CaptureQueueDatabase extends RoomDatabase {

    private static volatile CaptureQueueDatabase INSTANCE;

    /**
     * v1 → v2：新增 suggestedCategory 和 defaultAccountId 列。
     * 两列均为 @Nullable，默认值为 NULL，不影响已有记录。
     */
    static final Migration MIGRATION_1_TO_2 = new Migration(1, 2) {
        @Override
        public void migrate(SupportSQLiteDatabase db) {
            db.execSQL("ALTER TABLE capture_queue ADD COLUMN suggestedCategory TEXT");
            db.execSQL("ALTER TABLE capture_queue ADD COLUMN defaultAccountId TEXT");
        }
    };

    /**
     * v2 → v3：capture_queue 新增 note（自动备注）/ direction（方向判定）列，
     * 并新建 capture_fingerprint 持久去重表（PRD §8.3）。
     */
    static final Migration MIGRATION_2_TO_3 = new Migration(2, 3) {
        @Override
        public void migrate(SupportSQLiteDatabase db) {
            db.execSQL("ALTER TABLE capture_queue ADD COLUMN note TEXT");
            db.execSQL("ALTER TABLE capture_queue ADD COLUMN direction TEXT");
            db.execSQL("CREATE TABLE IF NOT EXISTS capture_fingerprint ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, "
                    + "fingerprint TEXT NOT NULL, "
                    + "sourcePackage TEXT, "
                    + "amountMinor INTEGER, "
                    + "occurredAt TEXT, "
                    + "sourceOrderId TEXT, "
                    + "status TEXT NOT NULL, "
                    + "createdAt INTEGER NOT NULL)");
            db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS "
                    + "index_capture_fingerprint_fingerprint ON capture_fingerprint (fingerprint)");
        }
    };

    /**
     * v3 → v4：capture_queue 新增 originalAmountMinor/discountMinor（原价与优惠，结构化传递）。
     */
    static final Migration MIGRATION_3_TO_4 = new Migration(3, 4) {
        @Override
        public void migrate(SupportSQLiteDatabase db) {
            db.execSQL("ALTER TABLE capture_queue ADD COLUMN originalAmountMinor INTEGER");
            db.execSQL("ALTER TABLE capture_queue ADD COLUMN discountMinor INTEGER");
        }
    };

    /**
     * v4 → v5：capture_queue 新增 feeMinor（手续费）与 targetAccountHint（转账转入方）。
     */
    static final Migration MIGRATION_4_TO_5 = new Migration(4, 5) {
        @Override
        public void migrate(SupportSQLiteDatabase db) {
            db.execSQL("ALTER TABLE capture_queue ADD COLUMN feeMinor INTEGER");
            db.execSQL("ALTER TABLE capture_queue ADD COLUMN targetAccountHint TEXT");
        }
    };

    public abstract CaptureQueueDao captureQueueDao();

    public static CaptureQueueDatabase getInstance(Context context) {
        if (INSTANCE == null) {
            synchronized (CaptureQueueDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = Room.databaseBuilder(
                            context.getApplicationContext(),
                            CaptureQueueDatabase.class,
                            "capture_queue.db"
                    ).addMigrations(MIGRATION_1_TO_2, MIGRATION_2_TO_3, MIGRATION_3_TO_4, MIGRATION_4_TO_5).build();
                }
            }
        }
        return INSTANCE;
    }
}