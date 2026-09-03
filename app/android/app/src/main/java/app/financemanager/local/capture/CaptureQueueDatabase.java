package app.financemanager.local.capture;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;
import androidx.room.migration.Migration;
import androidx.sqlite.db.SupportSQLiteDatabase;

@Database(entities = {CaptureQueueEntity.class}, version = 2, exportSchema = false)
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

    public abstract CaptureQueueDao captureQueueDao();

    public static CaptureQueueDatabase getInstance(Context context) {
        if (INSTANCE == null) {
            synchronized (CaptureQueueDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = Room.databaseBuilder(
                            context.getApplicationContext(),
                            CaptureQueueDatabase.class,
                            "capture_queue.db"
                    ).addMigrations(MIGRATION_1_TO_2).build();
                }
            }
        }
        return INSTANCE;
    }
}