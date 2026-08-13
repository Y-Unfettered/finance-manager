package app.financemanager.capture.notification;

import android.util.Log;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import app.financemanager.capture.accessibility.CapturedPaymentInfo;
import app.financemanager.capture.accessibility.WhitelistPackages;

/**
 * 微信支付通知适配器。
 *
 * 典型通知：
 *   标题: "微信支付"
 *   正文: "微信支付 商户：星巴克 ¥18.00" 或 "您已成功向星巴克付款 18.00 元"
 */
public class WechatNotificationAdapter implements NotificationParserAdapter {

    private static final String TAG = "WechatNotif";

    private static final Pattern AMOUNT_PATTERN = Pattern.compile("[¥￥]\\s*(\\d+[\\.\\d]*)|\\d+[\\.\\d]*\\s*元");
    private static final Pattern MERCHANT_PATTERN = Pattern.compile("(?:商户|商家|收款方)[:：]\\s*(.+)");
    private static final Pattern ORDER_PATTERN = Pattern.compile("(?:订单号|商户单号)[:：]\\s*(\\S+)");

    @Override
    public String getPackageName() {
        return WhitelistPackages.WECHAT;
    }

    @Override
    public CapturedPaymentInfo parse(String title, String text, String packageName) {
        String combined = (title != null ? title : "") + " " + (text != null ? text : "");
        if (!combined.contains("支付") && !combined.contains("付款")) return null;

        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setSourcePackage(getPackageName());
        info.setSourceName(WhitelistPackages.getName(getPackageName()));

        Matcher m = AMOUNT_PATTERN.matcher(combined);
        if (m.find()) {
            info.setAmount(m.group(1));
            info.setAmountMinor(CapturedPaymentInfo.parseAmountMinor(m.group(1)));
        }

        Matcher mm = MERCHANT_PATTERN.matcher(combined);
        if (mm.find()) info.setMerchant(mm.group(1).trim());

        Matcher mo = ORDER_PATTERN.matcher(combined);
        if (mo.find()) info.setOrderNo(mo.group(1).trim());

        if (!info.isHasAmount()) {
            Log.d(TAG, "微信支付通知未提取到金额，跳过");
            return null;
        }

        Log.d(TAG, "微信支付通知解析成功: " + info);
        return info;
    }
}