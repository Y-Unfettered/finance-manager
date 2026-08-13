package app.financemanager.capture.notification;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import app.financemanager.capture.accessibility.CapturedPaymentInfo;

/**
 * 通用通知适配器：适用于 JD / 美团 / 抖音等尚未做深度适配的 APP。
 * 仅提取「支付/付款/成功」+ 金额的粗略匹配。
 */
public class GenericNotificationAdapter implements NotificationParserAdapter {

    private static final Pattern AMOUNT_PATTERN =
            Pattern.compile("[¥￥]\\s*(\\d+[\\.\\d]*)|\\d+[\\.\\d]*\\s*元");

    private final String packageName;
    private final String sourceName;

    public GenericNotificationAdapter(String packageName, String sourceName) {
        this.packageName = packageName;
        this.sourceName = sourceName;
    }

    @Override
    public String getPackageName() {
        return packageName;
    }

    @Override
    public CapturedPaymentInfo parse(String title, String text, String packageName) {
        String combined = (title != null ? title : "") + " " + (text != null ? text : "");
        if (!combined.contains("支付") && !combined.contains("付款") && !combined.contains("成功")
                && !combined.contains("消费")) return null;

        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setSourcePackage(this.packageName);
        info.setSourceName(sourceName);
        info.setConfidence("low");

        Matcher m = AMOUNT_PATTERN.matcher(combined);
        if (m.find()) {
            info.setAmount(m.group(1));
            info.setAmountMinor(CapturedPaymentInfo.parseAmountMinor(m.group(1)));
        }

        Pattern merchantPattern = Pattern.compile("(?:商家|商户|收款方)[:：]\\s*(.+)");
        Matcher mm = merchantPattern.matcher(combined);
        if (mm.find()) info.setMerchant(mm.group(1).trim());

        return info.isHasAmount() ? info : null;
    }
}