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

    private static final Pattern SUCCESS_PATTERN = Pattern.compile("(支付成功|付款成功|当前状态\\s*支付成功)");
    // 金额：兼容 "¥18.00"、"-5.00"、"18.00 元"、"-5.00" 等格式（微信交易详情页显示 -5.00）
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("[¥￥]?\\s*(-?\\d+[\\.\\d]{1,2})\\s*(?:元)?");
    private static final Pattern MERCHANT_PATTERN = Pattern.compile("(?:商户|商家|收款方)[:：]\\s*(.+)");
    private static final Pattern ORDER_PATTERN = Pattern.compile("(?:商户单号|订单号|交易单号)[:：]\\s*(\\S+)");

    /** 详情页结构词：页面含任一则这是账单详情页，本适配器让位（详情解析归 DetailPageParser）。 */
    private static final String[] DETAIL_STRUCT_WORDS = {
            "支付时间", "转账时间", "转账备注", "对方账户", "商户单号", "交易单号",
            "转账单号", "收款方备注", "账单管理",
    };

    @Override
    public String getPackageName() {
        return WhitelistPackages.WECHAT;
    }

    @Override
    public CapturedPaymentInfo parse(AccessibilityService service, AccessibilityNodeInfo root) {
        String text = PaymentParserAdapter.extractVisibleText(root);
        // 页面文本含对方昵称/备注等敏感内容，只在 debug 构建输出（release 会剥离）
        if (app.financemanager.local.BuildConfig.DEBUG) {
            Log.d(TAG, "页面文本长度=" + (text == null ? 0 : text.length())
                    + " 前300字: " + (text == null ? "(null)" : text.substring(0, Math.min(text.length(), 300))));
        }
        if (text == null || text.isEmpty()) {
            AccessibilityDiagnostics.textEmpty(getPackageName());
            return null;
        }

        // 详情页让位：页面含详情结构词时不兜底（详情解析归 DetailPageParser）
        for (String w : DETAIL_STRUCT_WORDS) {
            if (text.contains(w)) {
                return null;
            }
        }

        if (!SUCCESS_PATTERN.matcher(text).find()) {
            Log.d(TAG, "未匹配到关键词 支付成功");
            AccessibilityDiagnostics.noKeyword(getPackageName(),
                    text.substring(0, Math.min(text.length(), 80)));
            return null;
        }

        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setSourcePackage(getPackageName());
        info.setSourceName(WhitelistPackages.getName(getPackageName()));

        String amountStr = extractFirst(text, AMOUNT_PATTERN, 1);
        if (amountStr == null) {
            amountStr = extractFirst(text, Pattern.compile("(-?\\d+[\\.\\d]{1,2})"), 1);
        }
        if (amountStr != null) {
            // 微信 H5 交易详情页显示 "-5.00"，去掉负号（支出金额按正数存）
            String cleanAmount = amountStr.replace("-", "").trim();
            info.setAmount(cleanAmount);
            info.setAmountMinor(CapturedPaymentInfo.parseAmountMinor(cleanAmount));
            Log.d(TAG, "金额原始=" + amountStr + " 清洗后=" + cleanAmount
                    + " amountMinor=" + info.getAmountMinor());
        }

        String merchant = extractFirst(text, MERCHANT_PATTERN, 1);
        if (merchant != null) {
            info.setMerchant(merchant.trim());
        } else {
            // 微信 H5 交易详情页：金额下方紧跟的那行就是对方昵称（如"淡看浮华"）
            // 找金额数字后面的第一个 2-20 字短文本作为商户名
            Matcher m = AMOUNT_PATTERN.matcher(text);
            if (m.find()) {
                int after = m.end();
                String tail = text.substring(after).trim();
                // 取第一行非空、非数字、非"支付成功"等关键词的短文本
                for (String line : tail.split("\\s+")) {
                    String t = line.trim();
                    if (t.length() >= 2 && t.length() <= 20
                            && !t.matches("-?\\d+[\\.\\d]*")
                            && !t.contains("支付") && !t.contains("成功")
                            && !t.contains("收单") && !t.contains("支付方式")
                            && !t.contains("交易单号") && !t.contains("经营单号")
                            && !t.contains("当前状态")) {
                        info.setMerchant(t);
                        break;
                    }
                }
            }
        }

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