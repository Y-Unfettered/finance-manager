package app.financemanager.local.capture;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.PrimaryKey;

@Entity(
    tableName = "capture_queue",
    indices = {
        @Index(value = "status"),
        @Index(value = {"sourcePackage", "occurredAt"})
    }
)
public class CaptureQueueEntity {

    @PrimaryKey(autoGenerate = true)
    public long id;

    @NonNull
    public String sourcePackage;

    @NonNull
    public String sourceName;

    @NonNull
    public String captureMethod;

    @NonNull
    public String occurredAt;

    public Long amountMinor;

    @NonNull
    public String currency;

    @Nullable
    public String merchant;

    @Nullable
    public String accountHint;

    @Nullable
    public String sourceOrderId;

    @Nullable
    public String rawFingerprint;

    public float confidence;

    @NonNull
    public String parserVersion;

    @NonNull
    public String status;

    public long createdAt;

    public long getId() { return id; }
    public void setId(long id) { this.id = id; }

    @NonNull public String getSourcePackage() { return sourcePackage; }
    public void setSourcePackage(@NonNull String v) { this.sourcePackage = v; }

    @NonNull public String getSourceName() { return sourceName; }
    public void setSourceName(@NonNull String v) { this.sourceName = v; }

    @NonNull public String getCaptureMethod() { return captureMethod; }
    public void setCaptureMethod(@NonNull String v) { this.captureMethod = v; }

    @NonNull public String getOccurredAt() { return occurredAt; }
    public void setOccurredAt(@NonNull String v) { this.occurredAt = v; }

    @Nullable public Long getAmountMinor() { return amountMinor; }
    public void setAmountMinor(@Nullable Long v) { this.amountMinor = v; }

    @NonNull public String getCurrency() { return currency; }
    public void setCurrency(@NonNull String v) { this.currency = v; }

    @Nullable public String getMerchant() { return merchant; }
    public void setMerchant(@Nullable String v) { this.merchant = v; }

    @Nullable public String getAccountHint() { return accountHint; }
    public void setAccountHint(@Nullable String v) { this.accountHint = v; }

    @Nullable public String getSourceOrderId() { return sourceOrderId; }
    public void setSourceOrderId(@Nullable String v) { this.sourceOrderId = v; }

    @Nullable public String getRawFingerprint() { return rawFingerprint; }
    public void setRawFingerprint(@Nullable String v) { this.rawFingerprint = v; }

    public float getConfidence() { return confidence; }
    public void setConfidence(float v) { this.confidence = v; }

    @NonNull public String getParserVersion() { return parserVersion; }
    public void setParserVersion(@NonNull String v) { this.parserVersion = v; }

    @NonNull public String getStatus() { return status; }
    public void setStatus(@NonNull String v) { this.status = v; }

    public long getCreatedAt() { return createdAt; }
    public void setCreatedAt(long v) { this.createdAt = v; }
}