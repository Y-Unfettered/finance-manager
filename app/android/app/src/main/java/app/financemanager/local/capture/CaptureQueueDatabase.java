package app.financemanager.local.capture;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

@Database(entities = {CaptureQueueEntity.class}, version = 1, exportSchema = false)
public abstract class CaptureQueueDatabase extends RoomDatabase {

    private static volatile CaptureQueueDatabase INSTANCE;

    public abstract CaptureQueueDao captureQueueDao();

    public static CaptureQueueDatabase getInstance(Context context) {
        if (INSTANCE == null) {
            synchronized (CaptureQueueDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = Room.databaseBuilder(
                            context.getApplicationContext(),
                            CaptureQueueDatabase.class,
                            "capture_queue.db"
                    ).build();
                }
            }
        }
        return INSTANCE;
    }
}