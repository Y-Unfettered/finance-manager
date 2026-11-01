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

    @Query("SELECT * FROM capture_queue WHERE id = :id LIMIT 1")
    CaptureQueueEntity getById(long id);

    @Query("SELECT COUNT(*) FROM capture_queue WHERE status = 'pending'")
    int pendingCount();

    @Query("SELECT COUNT(*) FROM capture_queue WHERE status = :status")
    int countByStatus(String status);

    // --- capture_fingerprint 表（持久去重） ---

    @Query("SELECT * FROM capture_fingerprint WHERE fingerprint = :fingerprint LIMIT 1")
    CaptureFingerprintEntity findByFingerprint(String fingerprint);

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    long insertFingerprint(CaptureFingerprintEntity entity);

    @Query("UPDATE capture_fingerprint SET status = :status WHERE fingerprint = :fingerprint")
    void updateFingerprintStatus(String fingerprint, String status);

    @Query("DELETE FROM capture_fingerprint WHERE fingerprint = :fingerprint")
    void deleteFingerprint(String fingerprint);

    /** 清空全部指纹（调试：重测所有已捕获过的账单详情）。 */
    @Query("DELETE FROM capture_fingerprint")
    void clearAllFingerprints();

    /** 清空 pending 指纹（"全部忽略"后允许这些账单重新捕获；confirmed 保留）。 */
    @Query("DELETE FROM capture_fingerprint WHERE status = 'pending'")
    void clearPendingFingerprints();

    /** 清空 pending 待确认事件（规则升级时旧捕获不可信）。 */
    @Query("DELETE FROM capture_queue WHERE status = 'pending'")
    void deletePendingEvents();
}