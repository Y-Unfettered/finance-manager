package app.financemanager.capture.accessibility;

/**
 * 解析后的支付信息。
 * 各支付 APP 适配器输出统一的 CapturedPaymentInfo 结构。
 */
public class CapturedPaymentInfo {

    private String sourcePackage;
    private String sourceName;
    private String amount;            // 原始金额字符串，如 "48.50"
    private Long amountMinor;         // 金额（分），如 4850
    private String merchant;          // 商户名
    private String accountHint;       // 账户线索（如"支付宝余额"）
    private String occurredAt;        // ISO-8601 时间字符串
    private String orderNo;           // 订单号
    private String confidence;        // 字段完整度描述
    private boolean hasAmount;        // 是否解析到金额（必填字段）
    private String suggestedCategory; // 规则建议的分类 ID（格式 "kind:id"）
    private String defaultAccountId;  // 规则建议的默认账户 ID
    private String note;              // 自动生成的备注（"为什么花"）
    private String direction;         // 方向判定：income/transfer/refund/expense/confirm
    private Long originalAmountMinor; // 原价（订单金额，有优惠时与实付不同）
    private Long discountMinor;       // 优惠金额（原价 - 实付）
    private Long feeMinor;            // 手续费（如提现服务费）
    private String targetAccountHint; // 转账转入方账户线索（transfer 用）

    public CapturedPaymentInfo() {
        this.confidence = "high";
        this.hasAmount = false;
    }

    // --- 金额相关 ---

    public String getAmount() { return amount; }
    public void setAmount(String amount) {
        this.amount = amount;
        if (amount != null && !amount.isEmpty()) {
            this.hasAmount = true;
        }
    }

    public Long getAmountMinor() { return amountMinor; }
    public void setAmountMinor(Long amountMinor) { this.amountMinor = amountMinor; }

    /** 从金额字符串解析为「分」单位。支持 "48.50"、"¥48.50" 等。 */
    public static Long parseAmountMinor(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        // 提取数字部分
        StringBuilder digits = new StringBuilder();
        boolean afterDot = false;
        int decimalPlaces = 0;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (Character.isDigit(c)) {
                digits.append(c);
                if (afterDot) decimalPlaces++;
            } else if (c == '.' && !afterDot) {
                afterDot = true;
            } else if (!Character.isWhitespace(c) && c != '¥' && c != '￥' && c != '$') {
                // 遇到非数字、非小数点、非货币符号的字符，停止
                // 但允许中间有空格（例如 "48 500"）
                break;
            }
        }
        if (digits.length() == 0) return null;
        long cents = Long.parseLong(digits.toString());
        // 如果小数位 < 2，需要补零到「分」
        if (decimalPlaces == 0) {
            cents *= 100;
        } else if (decimalPlaces == 1) {
            cents *= 10;
        }
        return cents > 0 ? cents : null;
    }

    // --- 商户/账户 ---

    public String getMerchant() { return merchant; }
    public void setMerchant(String merchant) { this.merchant = merchant; }

    public String getAccountHint() { return accountHint; }
    public void setAccountHint(String accountHint) { this.accountHint = accountHint; }

    // --- 来源 ---

    public String getSourcePackage() { return sourcePackage; }
    public void setSourcePackage(String sourcePackage) { this.sourcePackage = sourcePackage; }

    public String getSourceName() { return sourceName; }
    public void setSourceName(String sourceName) { this.sourceName = sourceName; }

    // --- 时间/订单 ---

    public String getOccurredAt() { return occurredAt; }
    public void setOccurredAt(String occurredAt) { this.occurredAt = occurredAt; }

    public String getOrderNo() { return orderNo; }
    public void setOrderNo(String orderNo) { this.orderNo = orderNo; }

    // --- 置信度 ---

    public String getConfidence() { return confidence; }
    public void setConfidence(String confidence) { this.confidence = confidence; }

    public boolean isHasAmount() { return hasAmount; }

    // --- 规则建议字段 ---

    public String getSuggestedCategory() { return suggestedCategory; }
    public void setSuggestedCategory(String suggestedCategory) { this.suggestedCategory = suggestedCategory; }

    public String getDefaultAccountId() { return defaultAccountId; }
    public void setDefaultAccountId(String defaultAccountId) { this.defaultAccountId = defaultAccountId; }

    // --- 备注/方向 ---

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }

    public Long getOriginalAmountMinor() { return originalAmountMinor; }
    public void setOriginalAmountMinor(Long v) { this.originalAmountMinor = v; }
    public Long getDiscountMinor() { return discountMinor; }
    public void setDiscountMinor(Long v) { this.discountMinor = v; }
    public Long getFeeMinor() { return feeMinor; }
    public void setFeeMinor(Long v) { this.feeMinor = v; }
    public String getTargetAccountHint() { return targetAccountHint; }
    public void setTargetAccountHint(String v) { this.targetAccountHint = v; }

    @Override
    public String toString() {
        return "CapturedPaymentInfo{"
                + "sourcePackage='" + sourcePackage + '\''
                + ", merchant='" + merchant + '\''
                + ", amount='" + amount + '\''
                + ", amountMinor=" + amountMinor
                + ", accountHint='" + accountHint + '\''
                + ", suggestedCategory='" + suggestedCategory + '\''
                + ", defaultAccountId='" + defaultAccountId + '\''
                + ", note='" + note + '\''
                + ", direction='" + direction + '\''
                + '}';
    }
}