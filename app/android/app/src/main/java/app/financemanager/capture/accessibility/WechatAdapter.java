package app.financemanager.capture.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 微信支付成功页适配器。
 *
 * 典型文本：
 *   "微信支付" / "支付"
 *   "成功" / "支付成功"
 *   "¥18.00"
 *   "星巴克" （商户名通常在金额附近）
 *   "商户单号:xxxx" （可选）
 */
public class WechatAdapter implements PaymentParserAdapter {

    private static final String TAG = "WechatAdapter";

    private static final Pattern SUCCESS_PATTERN = Pattern.compile("(支付成功|支付|付款成功)", Pattern.CASE_INSENSITIVE);
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("[¥￥]\\s*(\\d+[\\.\\d]*)|\\d+[\\.\\d]*\\s*元");
    private static final Pattern MERCHANT_PATTERN = Pattern.compile("(?:商户|商家|收款方)[:：]\\s*(.+)");
    private static final Pattern ORDER_PATTERN = Pattern.compile("(?:商户单号|订单号)[:：]\\s*(\\S+)");

    @Override
    public String getPackageName() {
        return WhitelistPackages.WECHAT;
    }

    @Override
    public CapturedPaymentInfo parse(AccessibilityService service, AccessibilityNodeInfo root) {
        String text = PaymentParserAdapter.extractVisibleText(root);
        if (text == null || text.isEmpty()) {
            AccessibilityDiagnostics.textEmpty(getPackageName());
            return null;
        }

        if (!SUCCESS_PATTERN.matcher(text).find()) {
            AccessibilityDiagnostics.noKeyword(getPackageName(),
                    text.substring(0, Math.min(text.length(), 80)));
            return null;
        }

        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setSourcePackage(getPackageName());
        info.setSourceName(WhitelistPackages.getName(getPackageName()));

        String amountStr = extractFirst(text, AMOUNT_PATTERN, 1);
        if (amountStr == null) {
            amountStr = extractFirst(text, Pattern.compile("(\\d+[\\.\\d]*)"), 1);
        }
        if (amountStr != null) {
            info.setAmount(amountStr);
            info.setAmountMinor(CapturedPaymentInfo.parseAmountMinor(amountStr));
        }

        String merchant = extractFirst(text, MERCHANT_PATTERN, 1);
        if (merchant != null) info.setMerchant(merchant.trim());

        String orderNo = extractFirst(text, ORDER_PATTERN, 1);
        if (orderNo != null) info.setOrderNo(orderNo.trim());

        if (!info.isHasAmount()) {
            AccessibilityDiagnostics.noAmount(getPackageName());
            Log.d(TAG, "微信支付页未提取到金额，跳过");
            return null;
        }

        AccessibilityDiagnostics.parsed(getPackageName(), info.getAmount(), info.getMerchant());
        Log.d(TAG, "微信支付解析成功: " + info);
        return info;
    }

    private static String extractFirst(String text, Pattern pattern, int group) {
        Matcher m = pattern.matcher(text);
        if (m.find()) return m.group(group);
        return null;
    }
}