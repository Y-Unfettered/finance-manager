package app.financemanager.local.capture;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.PrimaryKey;

/**
 * 捕获事件指纹表。
 *
 * 用于跨会话持久去重：一笔交易被"支付宝账单详情"与"购物订单详情"双通道
 * 各捕获一次时，依靠相同 fingerprint 识别为同一笔，静默丢弃重复项。
 *
 * fingerprint 构成（优先级从强到弱，取第一个可用）：
 *   ① sourceOrderId（订单号/户号/交易单号）—— 最强，跨体系也唯一
 *   ② hash(amountMinor + occurredAt + merchant) —— 无订单号时（购物/支付宝双通道共用此键）
 *   ③ hash(amountMinor + occurredAt) —— 最后兜底
 *
 * status：pending（写队列前预占）/ confirmed（确认落账后）/ dismissed（拒绝后删除）。
 */
@Entity(
    tableName = "capture_fingerprint",
    indices = {
        @Index(value = "fingerprint", unique = true)
    }
)
public class CaptureFingerprintEntity {

    @PrimaryKey(autoGenerate = true)
    public long id;

    /** 去重键（唯一）。 */
    @NonNull
    public String fingerprint;

    @Nullable
    public String sourcePackage;

    public Long amountMinor;

    @Nullable
    public String occurredAt;

    @Nullable
    public String sourceOrderId;

    /** pending / confirmed / dismissed */
    @NonNull
    public String status;

    public long createdAt;

    public long getId() { return id; }
    public void setId(long id) { this.id = id; }

    @NonNull public String getFingerprint() { return fingerprint; }
    public void setFingerprint(@NonNull String v) { this.fingerprint = v; }

    @Nullable public String getSourcePackage() { return sourcePackage; }
    public void setSourcePackage(@Nullable String v) { this.sourcePackage = v; }

    @Nullable public Long getAmountMinor() { return amountMinor; }
    public void setAmountMinor(@Nullable Long v) { this.amountMinor = v; }

    @Nullable public String getOccurredAt() { return occurredAt; }
    public void setOccurredAt(@Nullable String v) { this.occurredAt = v; }

    @Nullable public String getSourceOrderId() { return sourceOrderId; }
    public void setSourceOrderId(@Nullable String v) { this.sourceOrderId = v; }

    @NonNull public String getStatus() { return status; }
    public void setStatus(@NonNull String v) { this.status = v; }

    public long getCreatedAt() { return createdAt; }
    public void setCreatedAt(long v) { this.createdAt = v; }
}
