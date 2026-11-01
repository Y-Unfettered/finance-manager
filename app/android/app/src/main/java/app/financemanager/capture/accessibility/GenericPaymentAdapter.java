package app.financemanager.capture.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityNodeInfo;

/**
 * 通用适配器：适用于 JD / 美团 / 抖音等尚未做深度适配的白名单 APP。
 * 仅提取「成功」+ 金额的粗略匹配，作为兜底。
 */
public class GenericPaymentAdapter implements PaymentParserAdapter {

    private static final String TAG = "GenericAdapter";
    private static final java.util.regex.Pattern AMOUNT_PATTERN =
            java.util.regex.Pattern.compile("[¥￥]\\s*(\\d+[\\.\\d]*)|(\\d+[\\.\\d]*)\\s*元");

    private final String packageName;
    private final String sourceName;

    public GenericPaymentAdapter(String packageName, String sourceName) {
        this.packageName = packageName;
        this.sourceName = sourceName;
    }

    @Override
    public String getPackageName() {
        return packageName;
    }

    @Override
    public CapturedPaymentInfo parse(AccessibilityService service, AccessibilityNodeInfo root) {
        String text = PaymentParserAdapter.extractVisibleText(root);
        if (text == null || text.isEmpty()) {
            AccessibilityDiagnostics.textEmpty(packageName);
            return null;
        }
        // 只认完整成功词（"成功/支付/付款"单字会把首页"付款码"、活动页"立减XX元"全误判）
        if (!text.contains("支付成功") && !text.contains("付款成功")
                && !text.contains("转账成功") && !text.contains("交易成功")) {
            AccessibilityDiagnostics.noKeyword(packageName,
                    text.substring(0, Math.min(text.length(), 80)));
            return null;
        }

        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setSourcePackage(packageName);
        info.setSourceName(sourceName);
        info.setConfidence("low");

        java.util.regex.Matcher m = AMOUNT_PATTERN.matcher(text);
        if (m.find()) {
            // 正则两分支：¥ 前缀命中 group(1)，"X 元" 后缀命中 group(2)
            String amountVal = m.group(1) != null ? m.group(1) : m.group(2);
            info.setAmount(amountVal);
            info.setAmountMinor(CapturedPaymentInfo.parseAmountMinor(amountVal));
        }

        if (!info.isHasAmount()) {
            AccessibilityDiagnostics.noAmount(packageName);
            return null;
        }

        java.util.regex.Pattern merchantPattern =
                java.util.regex.Pattern.compile("(?:商家|商户|收款方)[:：]\\s*(.+)");
        java.util.regex.Matcher mm = merchantPattern.matcher(text);
        if (mm.find()) info.setMerchant(mm.group(1).trim());

        AccessibilityDiagnostics.parsed(packageName, info.getAmount(), info.getMerchant());
        return info;
    }
}