package app.financemanager.capture.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 支付宝支付成功页适配器。
 *
 * 典型支付成功页文本结构：
 *   "支付成功" / "付款成功"
 *   "¥48.50"
 *   "商家:海底捞" / "海底捞火锅"
 *   "支付账户:支付宝余额" / "账户:储蓄卡****1234"
 *
 * 适配策略：
 * - 从全窗口文本中搜索「支付成功/付款成功」关键词确认页面类型
 * - 用正则提取金额（¥/￥后跟数字）
 * - 用「商家:」「商户:」「收款方:」等关键词提取商户名
 * - 用「账户:」「支付账户:」等关键词提取账户线索
 */
public class AlipayAdapter implements PaymentParserAdapter {

    private static final String TAG = "AlipayAdapter";

    // 支付宝确认关键词
    private static final Pattern SUCCESS_PATTERN = Pattern.compile("(支付成功|付款成功|转账成功)", Pattern.CASE_INSENSITIVE);

    // 金额匹配：¥/￥/元 + 可选空格 + 数字(.数字)?
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("[¥￥]\\s*(\\d+[\\.\\d]*)|\\d+[\\.\\d]*\\s*元");

    // 商户提取
    private static final Pattern MERCHANT_PATTERN = Pattern.compile("(?:商家|商户|收款方(?!式)|对方账户|店铺|收款人|转入)[:：]?\\s*([^\\n\\r]+)");

    // 账户提取
    private static final Pattern ACCOUNT_PATTERN = Pattern.compile("(?:支付账户|账户|付款方式|银行卡|储蓄卡|余额宝|余额)[:：]\\s*(.+)");

    /**
     * 详情页结构词：页面含任一则这是账单详情页（而非支付成功页），本适配器直接让位。
     * 详情解析由 DetailPageParser 负责；此处兜底在详情页只会抓出垃圾
     * （实测 2026-10-31：详情加载竞态时把时间戳当金额、"已启用"当商户、"账单管理"当备注）。
     */
    private static final String[] DETAIL_STRUCT_WORDS = {
            "创建时间", "转账备注", "对方账户", "账单管理", "支付时间", "收款方式",
    };

    @Override
    public String getPackageName() {
        return WhitelistPackages.ALIPAY;
    }

    @Override
    public CapturedPaymentInfo parse(AccessibilityService service, AccessibilityNodeInfo root) {
        String text = PaymentParserAdapter.extractVisibleText(root);
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

        // 确认是支付成功页
        if (!SUCCESS_PATTERN.matcher(text).find()) {
            AccessibilityDiagnostics.noKeyword(getPackageName(),
                    text.substring(0, Math.min(text.length(), 80)));
            return null;
        }

        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setSourcePackage(getPackageName());
        info.setSourceName(WhitelistPackages.getName(getPackageName()));

        // 金额必须带 ¥/元 符号——裸数字兜底会把时间戳/编号当金额（实测教训）
        String rawAmount = extractFirst(text, AMOUNT_PATTERN, 1);
        if (rawAmount != null) {
            info.setAmount(rawAmount);
            Long minor = CapturedPaymentInfo.parseAmountMinor(rawAmount);
            info.setAmountMinor(minor);
        }

        String merchant = extractFirst(text, MERCHANT_PATTERN, 1);
        if (merchant != null) {
            info.setMerchant(merchant.trim());
        }

        String account = extractFirst(text, ACCOUNT_PATTERN, 1);
        if (account != null) {
            info.setAccountHint(account.trim());
        }

        if (!info.isHasAmount()) {
            AccessibilityDiagnostics.noAmount(getPackageName());
            Log.d(TAG, "支付宝页未提取到金额，跳过: " + text.substring(0, Math.min(text.length(), 120)));
            return null;
        }

        AccessibilityDiagnostics.parsed(getPackageName(), info.getAmount(), info.getMerchant());
        Log.d(TAG, "支付宝解析成功: " + info);
        return info;
    }

    private static String extractFirst(String text, Pattern pattern, int group) {
        Matcher m = pattern.matcher(text);
        if (m.find()) {
            return m.group(group);
        }
        return null;
    }
}