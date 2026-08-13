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
            java.util.regex.Pattern.compile("[¥￥]\\s*(\\d+[\\.\\d]*)|\\d+[\\.\\d]*\\s*元");

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
        if (text == null || text.isEmpty()) return null;
        if (!text.contains("成功") && !text.contains("支付") && !text.contains("付款")) return null;

        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setSourcePackage(packageName);
        info.setSourceName(sourceName);
        info.setConfidence("low");

        java.util.regex.Matcher m = AMOUNT_PATTERN.matcher(text);
        if (m.find()) {
            info.setAmount(m.group(1));
            info.setAmountMinor(CapturedPaymentInfo.parseAmountMinor(m.group(1)));
        }

        if (!info.isHasAmount()) return null;

        java.util.regex.Pattern merchantPattern =
                java.util.regex.Pattern.compile("(?:商家|商户|收款方)[:：]\\s*(.+)");
        java.util.regex.Matcher mm = merchantPattern.matcher(text);
        if (mm.find()) info.setMerchant(mm.group(1).trim());

        return info;
    }
}