package app.financemanager.local.capture;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;
import androidx.room.Update;

import java.util.List;

@Dao
public interface CaptureQueueDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    long insert(CaptureQueueEntity entity);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    long[] insertAll(List<CaptureQueueEntity> entities);

    @Update
    void update(CaptureQueueEntity entity);

    @Query("SELECT * FROM capture_queue WHERE status = 'pending' ORDER BY createdAt DESC")
    List<CaptureQueueEntity> getPendingEvents();

    @Query("SELECT * FROM capture_queue WHERE status = :status ORDER BY createdAt DESC")
    List<CaptureQueueEntity> getEventsByStatus(String status);

    @Query("UPDATE capture_queue SET status = 'acknowledged' WHERE id IN (:ids)")
    void acknowledge(long[] ids);

    @Query("DELETE FROM capture_queue WHERE id = :id")
    void delete(long id);

    @Query("UPDATE capture_queue SET status = 'dismissed' WHERE id = :id")
    void dismiss(long id);

    @Query("UPDATE capture_queue SET status = 'expired' WHERE status = 'pending' AND createdAt < :beforeMs")
    int markExpired(long beforeMs);

    @Query("SELECT * FROM capture_queue ORDER BY createdAt DESC LIMIT 1")
    CaptureQueueEntity getLatest();

    @Query("SELECT COUNT(*) FROM capture_queue WHERE status = 'pending'")
    int pendingCount();

    @Query("SELECT COUNT(*) FROM capture_queue WHERE status = :status")
    int countByStatus(String status);
}