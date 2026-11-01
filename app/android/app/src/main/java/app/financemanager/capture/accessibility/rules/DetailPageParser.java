package app.financemanager.capture.accessibility.rules;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import app.financemanager.capture.accessibility.CapturedPaymentInfo;
import app.financemanager.capture.accessibility.PaymentParserAdapter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 结构化详情页解析器（账单详情 / 订单详情）。
 *
 * 由 {@code pageType=bill-detail | order-detail} 规则驱动，按"标签→值"结构化提取字段：
 * 实付金额 / 方向 / 创建时间 / 付款方式 / 说明(备注) / 对方账户 / 订单号。
 *
 * 不按 APP 重复逻辑：支付宝、微信（P1）与京东、美团、拼多多（P2）只需各配一份 JSON
 * （fieldAliases / pageSignature / noteRule / directionRule / categoryMappings），
 * 解析算法完全通用。
 *
 * 关键设计：
 * - 实付金额 ≠ 订单金额：优先取 实付/实收 标签旁的值，否则取整页绝对值最大的带符号金额。
 * - 时间双格式：支付宝 ISO "2026-10-31 11:03:34" 与微信中文 "2026年10月29日 13:24:44"
 *   统一转换为 "yyyy-MM-ddTHH:mm:ss"。
 * - 备注提取：noteRule.preferFields 优先级取字段值 → cleanPatterns 清洗（去尾缀/订单号/脱敏）→
 *   无意义降级（纯订单号回退 fallbackToMerchant）→ 截断 maxLength。
 * - 方向判断：以字段结构为准（对方账户→income；提现到/收款方式/处理进度且无对方账户→transfer；
 *   退款→refund；负金额→expense；否则 confirm），不以"提现/转账"字样为准。
 */
public class DetailPageParser {

    private static final String TAG = "DetailPageParser";

    /** 金额匹配：可选符号 + 可选货币符号 + 数字（整数部分 ≤6 位，防订单号/编号/余额被当金额）。 */
    private static final Pattern AMOUNT_PATTERN =
            Pattern.compile("([+-])?\\s*[¥￥]?\\s*(\\d{1,6}(?:\\.\\d{1,2})?)");

    /** 带符号金额（+/¥ 前缀）：转账/收款页的真实金额必带符号，绝对优先于裸数字。 */
    private static final Pattern SIGNED_AMOUNT_PATTERN =
            Pattern.compile("([+-])\\s*[¥￥]?\\s*(\\d{1,6}(?:\\.\\d{1,2})?)|[¥￥]\\s*(\\d{1,6}(?:\\.\\d{1,2})?)");

    /** 中文时间：2026年10月29日 13:24:44 */
    private static final Pattern CN_TIME_PATTERN =
            Pattern.compile("(\\d{4})年(\\d{1,2})月(\\d{1,2})日\\s+(\\d{1,2}):(\\d{2}):(\\d{2})");

    /** ISO 时间：2026-10-31 11:03:34 或 2026-10-31T11:03:34 */
    private static final Pattern ISO_TIME_PATTERN =
            Pattern.compile("(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})[T ](\\d{1,2}):(\\d{2}):(\\d{2})");

    private static final int DEFAULT_MAX_LENGTH = 50;

    /**
     * 通用 UI 噪声词（页面按钮/链接/功能区文案，非业务内容）。
     * 字段值若命中：不作为备注/字段值（继续取同标签的下一个候选值）。
     * 这是界面通用词表，不是业务枚举。
     */
    private static final java.util.Set<String> UI_NOISE_WORDS = new java.util.HashSet<>(java.util.Arrays.asList(
            "更多", "查看更多", "查看更多详情", "展开", "收起", "去看看", "详情", "全部", "编辑", "删除",
            "复制", "查看", "添加", "选择", "请选择", "开关", "分享", "保存", "完成",
            // 支付宝/微信账单详情页底部功能区（实测 2026-10-31：渲染顺序竞态会排到字段标签后面）
            "账单管理", "账单分类", "我的消费图鉴", "往来流水证明", "查看往来记录",
            "对此订单有疑问", "计入收支", "推荐服务", "使用记账本", "转账红包", "标签", "备注"));

    /** 是否为 UI 噪声词：整值命中，或包含长度 ≥5 的噪声长词（如"查看更多详情"）。 */
    static boolean isUiNoise(String s) {
        if (s == null) return false;
        String t = s.trim();
        if (t.isEmpty() || t.length() > 12) return false;
        if (UI_NOISE_WORDS.contains(t)) return true;
        for (String w : UI_NOISE_WORDS) {
            // 长词才做包含匹配：短词（"备注""标签"）包含匹配会误杀真实备注
            if (w.length() >= 5 && t.contains(w)) return true;
        }
        return false;
    }

    /** 金额解析结果：绝对值（分）+ 是否带负号 + 原始串。包可见以便 JVM 单测。 */
    static class AmountResult {
        final long minor;
        final boolean negative;
        final String raw;
        AmountResult(long minor, boolean negative, String raw) {
            this.minor = minor;
            this.negative = negative;
            this.raw = raw;
        }
    }

    /**
     * 解析账单/订单详情页。
     *
     * @return 解析结果；null 表示页面签名不匹配或无法解析。
     */
    public CapturedPaymentInfo parse(
            AccessibilityService service,
            AccessibilityNodeInfo root,
            String packageName,
            JSONObject rule) {

        String text = PaymentParserAdapter.extractVisibleText(root);
        if (text == null || text.isEmpty()) {
            return null;
        }

        // 1. 页面特征签名校验（不匹配则不是目标详情页，返回 null 走成功页兜底）
        String sigFail = checkPageSignature(text, rule);
        if (sigFail != null) {
            // 规则化运维关键日志：未识别页面一眼看到缺哪个特征，照此补规则 JSON 即可
            Log.d(TAG, "详情签名不匹配(" + packageName + ", 规则=" + rule.optString("id", "?")
                    + "): " + sigFail);
            return null;
        }

        try {
            // 2. 构建 标签→值 映射
            Map<String, String> fields = extractFields(text, rule);
            if (fields == null) return null;

            CapturedPaymentInfo info = new CapturedPaymentInfo();
            info.setSourcePackage(packageName);
            info.setSourceName(rule.optString("name", packageName));

            // 3. 实付金额（必填）
            AmountResult amount = extractPaidAmount(text, fields, rule);
            if (amount == null) {
                return null;
            }
            info.setAmountMinor(amount.minor);
            info.setAmount(String.format("%.2f", amount.minor / 100.0));

            // 4. 时间（双格式 → ISO）
            info.setOccurredAt(extractOccurredAt(fields, rule));

            // 5. 商户 / 对方账户
            String merchant = extractMerchant(text, fields, rule);
            if (merchant != null && !merchant.isEmpty()) {
                info.setMerchant(merchant);
            }

            // 6. 账户线索（付款方式/支付方式）
            String accountHint = extractFirstField(fields, rule.optJSONObject("fieldAliases"), "accountLabel");
            if (accountHint != null && !accountHint.isEmpty()) {
                info.setAccountHint(accountHint);
            }

            // 7. 订单号 / 户号（用于指纹）
            String orderId = extractFirstField(fields, rule.optJSONObject("fieldAliases"), "orderIdLabel");
            if (orderId != null && !orderId.isEmpty()) {
                info.setOrderNo(orderId);
            }

            // 8. 备注生成（"为什么花"）
            String note = extractNote(fields, rule, merchant);
            if (note != null && !note.isEmpty()) {
                info.setNote(note);
            }

            // 8b. 红包/优惠结构化提取：原价/优惠随捕获传递，记账页用原生优惠功能预填
            //     （原价入金额框、优惠入优惠框、实付自动算出——不再拼进备注文本）
            long[] discount = extractDiscount(fields, rule, amount.minor);
            if (discount != null) {
                info.setOriginalAmountMinor(discount[0]);
                info.setDiscountMinor(discount[1]);
            }

            // 8c. 手续费提取（如微信提现服务费）：值内嵌金额，转出申请额 = 实到 + 服务费
            Long fee = extractFee(fields, rule, amount.minor);
            if (fee != null && fee > 0) {
                info.setFeeMinor(fee);
                info.setOriginalAmountMinor(amount.minor + fee);
                info.setDiscountMinor(null);
            }

            // 8d. 转账双账户：transferTitle 拆分（"零钱通转出-到零钱"→转出方/转入方）+ 字段值兜底
            String[] transferAccounts = extractTransferAccounts(text, fields, rule);
            if (transferAccounts != null) {
                if (info.getAccountHint() == null || info.getAccountHint().isEmpty()) {
                    info.setAccountHint(transferAccounts[0]);
                }
                info.setTargetAccountHint(transferAccounts[1]);
            }
            // 规则级固定账户提示（如红包→微信大号零钱）：source/target 各自兜底
            String defaultSource = rule.optString("defaultSourceAccountHint", "");
            if ((info.getAccountHint() == null || info.getAccountHint().isEmpty())
                    && !defaultSource.isEmpty()) {
                info.setAccountHint(defaultSource);
            }
            String defaultTarget = rule.optString("defaultTargetAccountHint", "");
            if ((info.getTargetAccountHint() == null || info.getTargetAccountHint().isEmpty())
                    && !defaultTarget.isEmpty()) {
                info.setTargetAccountHint(defaultTarget);
            }

            // 9. 方向判断（以字段结构为准，符号为辅）
            String direction = decideDirection(text, fields, amount.negative, rule);
            info.setDirection(direction);

            // 10. 分类建议：备注 + 商户 合并匹配（PRD §6.5）
            String category = suggestCategory(note, merchant, rule);
            if (category != null && !category.isEmpty()) {
                info.setSuggestedCategory(category);
            }

            // 11. 置信度：备注齐全 high，备注缺失 medium（降级记录照常弹窗）
            info.setConfidence(note != null && !note.isEmpty() ? "high" : "medium");

            Log.d(TAG, "详情解析成功: " + packageName + " amount=" + amount.minor
                    + " note=" + note + " direction=" + direction);
            return info;
        } catch (Exception e) {
            Log.w(TAG, "详情解析异常: " + packageName, e);
            return null;
        }
    }

    // ============ 页面签名 ============

    /**
     * 校验 pageSignature。
     * @return null 表示通过；否则返回失败原因（缺哪个关键词/标签），供日志定位规则缺口。
     */
    String checkPageSignature(String text, JSONObject rule) {
        JSONObject sig = rule.optJSONObject("pageSignature");
        if (sig == null) return null; // 无签名配置则不强校验（向后兼容）

        JSONArray requireAll = sig.optJSONArray("requireAll");
        if (requireAll != null) {
            for (int i = 0; i < requireAll.length(); i++) {
                String kw = requireAll.optString(i, "");
                if (!kw.isEmpty() && !text.contains(kw)) {
                    return "缺少关键词: " + kw;
                }
            }
        }

        JSONArray requiredLabels = sig.optJSONArray("requiredLabels");
        if (requiredLabels != null) {
            for (int i = 0; i < requiredLabels.length(); i++) {
                String label = requiredLabels.optString(i, "");
                if (!label.isEmpty() && !text.contains(label)) {
                    return "缺少标签: " + label;
                }
            }
        }

        // 任一标签命中：同义标签措辞并存时使用（如时间标签"创建时间"/"支付时间"只出现其一）
        JSONArray requiredAnyLabel = sig.optJSONArray("requiredAnyLabel");
        if (requiredAnyLabel != null && requiredAnyLabel.length() > 0) {
            boolean anyHit = false;
            for (int i = 0; i < requiredAnyLabel.length(); i++) {
                String label = requiredAnyLabel.optString(i, "");
                if (!label.isEmpty() && text.contains(label)) {
                    anyHit = true;
                    break;
                }
            }
            if (!anyHit) {
                StringBuilder sb = new StringBuilder("任一标签均未命中: ");
                for (int i = 0; i < requiredAnyLabel.length(); i++) {
                    if (i > 0) sb.append('/');
                    sb.append(requiredAnyLabel.optString(i, ""));
                }
                return sb.toString();
            }
        }

        // 业务字段任一命中：如支付宝提现/转账详情页没有"付款方式"，但有"提现到"/"收款方式"（PRD §6.1）
        JSONArray requireAnyOf = sig.optJSONArray("requireAnyOf");
        if (requireAnyOf != null && requireAnyOf.length() > 0) {
            boolean anyHit = false;
            for (int i = 0; i < requireAnyOf.length(); i++) {
                String label = requireAnyOf.optString(i, "");
                if (!label.isEmpty() && text.contains(label)) {
                    anyHit = true;
                    break;
                }
            }
            if (!anyHit) {
                StringBuilder sb = new StringBuilder("任一字段均未命中: ");
                for (int i = 0; i < requireAnyOf.length(); i++) {
                    if (i > 0) sb.append('/');
                    sb.append(requireAnyOf.optString(i, ""));
                }
                return sb.toString();
            }
        }
        return null;
    }

    // ============ 标签→值 映射 ============

    /** 展开 fieldAliases 的所有标签集合。 */
    private Set<String> collectKnownLabels(JSONObject rule) {
        Set<String> labels = new LinkedHashSet<>();
        JSONObject aliases = rule.optJSONObject("fieldAliases");
        if (aliases != null) {
            java.util.Iterator<String> keys = aliases.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                JSONArray arr = aliases.optJSONArray(key);
                if (arr != null) {
                    for (int i = 0; i < arr.length(); i++) {
                        String l = arr.optString(i, "");
                        if (!l.isEmpty()) labels.add(l);
                    }
                }
            }
        }
        // requiredLabels 也是已知标签（用于识别"标签行"）
        JSONObject sig = rule.optJSONObject("pageSignature");
        if (sig != null) {
            JSONArray required = sig.optJSONArray("requiredLabels");
            if (required != null) {
                for (int i = 0; i < required.length(); i++) {
                    String l = required.optString(i, "");
                    if (!l.isEmpty()) labels.add(l);
                }
            }
        }
        return labels;
    }

    /** 判断某行是否是"标签行"：恰好等于标签，或以"标签："开头。 */
    private String matchLabel(String line, Set<String> labels) {
        for (String label : labels) {
            if (line.equals(label)
                    || line.startsWith(label + "：")
                    || line.startsWith(label + ":")) {
                return label;
            }
        }
        return null;
    }

    /** 从整页文本构建 标签→值 映射（标签独占一行，值在下一非空行）。 */
    Map<String, String> extractFields(String text, JSONObject rule) {
        Set<String> labels = collectKnownLabels(rule);
        if (labels.isEmpty()) return new LinkedHashMap<>();

        String[] lines = text.split("\\n");
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) continue;
            String matched = matchLabel(line, labels);
            if (matched == null) continue;

            // 找下一非空行作为值；若下一非空行仍是标签行，则值为空。
            // 同一标签可能出现多次（渐进加载竞态：早期 dump 值为类目行/不完整，
            // 加载完成后标签再现且值为完整正文）→ 跳过 UI 噪声值，多候选时取信息最丰富者。
            for (int j = i + 1; j < lines.length; j++) {
                String next = lines[j].trim();
                if (next.isEmpty()) continue;
                if (matchLabel(next, labels) != null) break;
                if (isUiNoise(next)) continue; // "更多/展开"等按钮文案不是字段值，继续找
                String existing = map.get(matched);
                if (existing == null || existing.isEmpty() || isUiNoise(existing)) {
                    map.put(matched, next);
                } else if (next.length() > existing.length() && isMeaningful(next)) {
                    map.put(matched, next);
                }
                break;
            }
        }
        return map;
    }

    // ============ 金额 ============

    /** 实付金额：优先实付/实收标签值，否则整页绝对值最大带符号金额。 */
    AmountResult extractPaidAmount(String text, Map<String, String> fields, JSONObject rule) {
        JSONObject aliases = rule.optJSONObject("fieldAliases");
        JSONArray amountLabels = aliases != null ? aliases.optJSONArray("amountLabel") : null;

        // ① 优先取实付/实收标签旁的值
        if (amountLabels != null) {
            for (int i = 0; i < amountLabels.length(); i++) {
                String label = amountLabels.optString(i, "");
                String v = fields.get(label);
                if (v == null || v.isEmpty()) continue;
                AmountResult r = parseAmount(v);
                if (r != null) return r;
            }
        }

        // ② 整页扫描：带符号金额（+/¥）绝对优先于裸数字——转账/收款页的真实金额必带符号，
        //    页面上的余额/累计值/编号是裸数字，不能盖过 +24.22 这类带符号金额。
        //    负数优先于正数（实付通常为负）；同为正时取绝对值最大。
        //    扫描前先剔除时间串与括号内数字（卡号尾缀），避免 "2026-10-31" 的 2026、
        //    "中信银行(5441)" 的 5441 被误认为金额。
        String scanText = stripNonAmountNoise(text);
        AmountResult bestSigned = null;      // 带 +/¥ 符号（最高优先）
        AmountResult bestSignedNegative = null; // 带负号（支出实付，signed 中最优先）
        AmountResult bestNegative = null;    // 裸负数
        AmountResult bestPositive = null;    // 裸正数
        Matcher m = AMOUNT_PATTERN.matcher(scanText);
        while (m.find()) {
            // 长数字串片段跳过：商品单号"-2250617227094"会被"符号+前6位"截取成 225061，
            // 判据——数字组紧邻的前/后字符仍是数字，说明它只是长数字串的一部分
            int dg = m.groupCount() >= 2 ? 2 : 1;
            int ds = m.start(dg);
            int de = m.end(dg);
            if ((ds > 0 && Character.isDigit(scanText.charAt(ds - 1)))
                    || (de < scanText.length() && Character.isDigit(scanText.charAt(de)))) {
                continue;
            }
            String raw = m.group(0);
            if (isExcludedAmount(raw, fields, aliases)) continue;
            AmountResult r = parseAmount(raw);
            if (r == null) continue;
            boolean signed = SIGNED_AMOUNT_PATTERN.matcher(raw).matches()
                    || raw.contains("+") || raw.contains("¥") || raw.contains("￥");
            if (signed) {
                if (r.negative) {
                    // 带负号的 signed 是支出实付（-259.00），优先于 ¥ 前缀的原价/正数
                    if (bestSignedNegative == null || Math.abs(r.minor) > Math.abs(bestSignedNegative.minor)) {
                        bestSignedNegative = r;
                    }
                } else if (bestSigned == null || Math.abs(r.minor) > Math.abs(bestSigned.minor)) {
                    bestSigned = r;
                }
            } else if (r.negative) {
                if (bestNegative == null || Math.abs(r.minor) > Math.abs(bestNegative.minor)) {
                    bestNegative = r;
                }
            } else {
                if (bestPositive == null || Math.abs(r.minor) > Math.abs(bestPositive.minor)) {
                    bestPositive = r;
                }
            }
        }
        // 优先级：带负号（支出实付）> 带 +/¥ 正数 > 裸负数 > 裸正数
        if (bestSignedNegative != null) return bestSignedNegative;
        if (bestSigned != null) return bestSigned;
        return bestNegative != null ? bestNegative : bestPositive;
    }

    /**
     * 剔除会污染金额扫描的噪声：ISO/中文时间串、括号内数字（银行卡/户号尾缀）。
     * 替换为空格以保持其余文本位置关系。
     */
    static String stripNonAmountNoise(String text) {
        String s = text;
        s = CN_TIME_PATTERN.matcher(s).replaceAll(" ");
        s = ISO_TIME_PATTERN.matcher(s).replaceAll(" ");
        // 括号内纯数字（如 "(0652)"、"（5441）"）：3~8 位，避免误伤真实金额
        s = s.replaceAll("[（(]\\d{3,8}[)）]", " ");
        return s;
    }

    /** 排除明显是"订单金额/原价/优惠/红包/满减/立减"标签旁的金额（这些不是实付）。 */
    private boolean isExcludedAmount(String raw, Map<String, String> fields, JSONObject aliases) {
        if (aliases == null) return false;
        String[] excludedKeys = {"orderAmountLabel", "originalPriceLabel", "discountLabel"};
        for (String key : excludedKeys) {
            JSONArray arr = aliases.optJSONArray(key);
            if (arr == null) continue;
            for (int i = 0; i < arr.length(); i++) {
                String label = arr.optString(i, "");
                String v = fields.get(label);
                if (v != null && v.equals(raw.trim())) return true;
            }
        }
        return false;
    }

    /** 解析单个金额串（带符号），返回绝对值（分）+ 是否负。 */
    static AmountResult parseAmount(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        String s = raw.replace("¥", "").replace("￥", "").replace(",", "").trim();
        boolean negative = s.startsWith("-");
        // 剥掉符号再解析（CapturedPaymentInfo.parseAmountMinor 遇到非数字字符会截断）
        if (negative || s.startsWith("+")) {
            s = s.substring(1).trim();
        }
        Long minor = CapturedPaymentInfo.parseAmountMinor(s);
        if (minor == null || minor <= 0) return null;
        return new AmountResult(minor, negative, raw);
    }

    // ============ 时间 ============

    /** 时间双格式 → "yyyy-MM-ddTHH:mm:ss"。 */
    String extractOccurredAt(Map<String, String> fields, JSONObject rule) {
        JSONObject aliases = rule.optJSONObject("fieldAliases");
        JSONArray labels = aliases != null ? aliases.optJSONArray("occurredAtLabel") : null;
        if (labels == null) return null;
        for (int i = 0; i < labels.length(); i++) {
            String label = labels.optString(i, "");
            String v = fields.get(label);
            if (v == null || v.isEmpty()) continue;
            String iso = normalizeTime(v);
            if (iso != null) return iso;
        }
        return null;
    }

    /** 兼容 ISO / 中文 / 毫秒串，统一转 ISO。失败返回 null。 */
    static String normalizeTime(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty()) return null;

        // 纯数字毫秒串
        if (s.matches("\\d{10,13}")) {
            try {
                long ms = Long.parseLong(s);
                return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
                        .format(new java.util.Date(ms));
            } catch (Exception e) {
                return null;
            }
        }

        // 中文：2026年10月29日 13:24:44
        Matcher cn = CN_TIME_PATTERN.matcher(s);
        if (cn.find()) {
            return pad(cn.group(1)) + "-" + pad(cn.group(2)) + "-" + pad(cn.group(3))
                    + "T" + pad(cn.group(4)) + ":" + cn.group(5) + ":" + cn.group(6);
        }

        // ISO：2026-10-31 11:03:34 / 2026-10-31T11:03:34
        Matcher iso = ISO_TIME_PATTERN.matcher(s);
        if (iso.find()) {
            return pad(iso.group(1)) + "-" + pad(iso.group(2)) + "-" + pad(iso.group(3))
                    + "T" + pad(iso.group(4)) + ":" + iso.group(5) + ":" + iso.group(6);
        }

        // 其他：交给 Date.parse 兜底（可能返回毫秒）
        try {
            long ms = java.text.DateFormat.getDateTimeInstance()
                    .parse(s).getTime();
            return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
                    .format(new java.util.Date(ms));
        } catch (Exception e) {
            return null;
        }
    }

    private static String pad(String s) {
        return s.length() < 2 ? "0" + s : s;
    }

    // ============ 商户 / 字段取值 ============

    /**
     * 手续费提取（feeLabel 标签值内嵌金额，如"服务费 ¥0.04"）。仅当 手续费 < 主金额 时返回。
     */
    Long extractFee(Map<String, String> fields, JSONObject rule, long mainMinor) {
        JSONObject aliases = rule.optJSONObject("fieldAliases");
        if (aliases == null) return null;
        JSONArray feeLabels = aliases.optJSONArray("feeLabel");
        if (feeLabels == null) return null;
        for (int i = 0; i < feeLabels.length(); i++) {
            String v = fields.get(feeLabels.optString(i, ""));
            if (v == null || v.isEmpty()) continue;
            Matcher am = AMOUNT_PATTERN.matcher(v);
            while (am.find()) {
                int dg = 2;
                int ds = am.start(dg);
                int de = am.end(dg);
                if ((ds > 0 && Character.isDigit(v.charAt(ds - 1)))
                        || (de < v.length() && Character.isDigit(v.charAt(de)))) {
                    continue;
                }
                AmountResult cand = parseAmount(am.group(0));
                if (cand != null && cand.minor < mainMinor) {
                    return cand.minor;
                }
            }
        }
        return null;
    }

    /**
     * 转账双账户提取（transferExtract.titleSeparator 分隔标题，如"零钱通转出-到零钱"）。
     * targetAccountLabel 字段值兜底；defaultSource/defaultTargetAccountHint 最后兜底。
     */
    String[] extractTransferAccounts(String text, Map<String, String> fields, JSONObject rule) {
        JSONObject te = rule.optJSONObject("transferExtract");
        String separator = te != null ? te.optString("titleSeparator", "") : "";
        String defaultSource = te != null ? te.optString("defaultSourceAccountHint", "") : "";
        String defaultTarget = te != null ? te.optString("defaultTargetAccountHint", "") : "";

        String source = null;
        String target = null;
        if (!separator.isEmpty()) {
            String titleLine = null;
            for (String line : text.split("\n")) {
                String t = line.trim();
                if (t.isEmpty() || isUiNoise(t)) continue;
                titleLine = t;
                break;
            }
            if (titleLine != null && titleLine.contains(separator)) {
                String[] parts = titleLine.split(java.util.regex.Pattern.quote(separator), 2);
                source = parts[0].trim();
                target = parts.length > 1 ? parts[1].trim() : null;
            }
        }
        String byField = extractFirstField(fields, rule.optJSONObject("fieldAliases"), "targetAccountLabel");
        if ((target == null || target.isEmpty()) && byField != null && !byField.isEmpty()) {
            target = byField;
        }
        // 规则配置的固定提示优先于标题拆分值（字段化：换账户名时只改规则）
        if (defaultSource != null && !defaultSource.isEmpty()) source = defaultSource;
        if (defaultTarget != null && !defaultTarget.isEmpty()) target = defaultTarget;
        if (source == null || source.isEmpty()) return null;
        return new String[]{source, target == null ? "" : target};
    }

    /** 商户：优先标签匹配（商户全称/对方账户等明示字段），无标签时布局锚点兜底。 */
    String extractMerchant(String text, Map<String, String> fields, JSONObject rule) {
        // ① 标签匹配：商户全称/对方账户/收款方等明示字段最准（如微信缴费页"商户全称：四川省财政厅"）
        String byLabel = extractFirstField(fields, rule.optJSONObject("fieldAliases"), "merchantLabel");
        if (byLabel != null && !byLabel.isEmpty()) {
            return byLabel;
        }
        // ② 布局锚点兜底：商户名固定在金额行上方（无标签前缀的模板，如支付宝保险页、微信扫码页）。
        //    模板级结构——换公司名、换金额都不变，比内容猜测可靠。
        return extractByLayout(text, rule);
    }

    /**
     * 布局锚点提取（模板结构）。
     * 规则配置：layoutExtract.merchant = { anchor: "amount", offset: -1 }
     *   anchor=amount → 定位第一个金额形态的行；offset=-1 → 取其上一行。
     * 行序即节点顺序（extractVisibleText 按节点树摊平），模板不变则位置不变。
     */
    String extractByLayout(String text, JSONObject rule) {
        JSONObject layout = rule.optJSONObject("layoutExtract");
        if (layout == null) return null;
        JSONObject spec = layout.optJSONObject("merchant");
        if (spec == null) return null;
        String anchor = spec.optString("anchor", "amount");
        int offset = spec.optInt("offset", -1);
        if (!"amount".equals(anchor)) return null;

        String[] lines = text.split("\\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) continue;
            if (line.matches("[+-]?[¥￥]?\\s*\\d{1,6}(\\.\\d{1,2})?")) {
                int idx = i + offset;
                if (idx < 0 || idx >= lines.length) return null;
                String v = lines[idx].trim();
                if (v.isEmpty() || isUiNoise(v)) return null;
                // 模板固定前缀清洗：如微信扫码付款标题"扫二维码付款-给135790yaoywc" → "135790yaoywc"
                String prefix = spec.optString("stripPrefix", "");
                if (!prefix.isEmpty() && v.startsWith(prefix)) {
                    v = v.substring(prefix.length()).trim();
                }
                // 前缀正则清洗（同义前缀变体，如"商家转账-来自"/"转账-来自"）
                String prefixPattern = spec.optString("stripPrefixPattern", "");
                if (!prefixPattern.isEmpty()) {
                    v = v.replaceFirst(prefixPattern, "").trim();
                }
                return v.isEmpty() ? null : v;
            }
        }
        return null;
    }

    /** 取 fieldAliases 中某个逻辑字段（如 accountLabel/merchantLabel/noteLabel/orderIdLabel）的第一个命中值。 */
    String extractFirstField(Map<String, String> fields, JSONObject aliases, String logicalKey) {
        if (aliases == null) return null;
        JSONArray arr = aliases.optJSONArray(logicalKey);
        if (arr == null) return null;
        for (int i = 0; i < arr.length(); i++) {
            String label = arr.optString(i, "");
            String v = fields.get(label);
            if (v != null && !v.isEmpty()) return v;
        }
        return null;
    }

    // ============ 备注 ============

    /** 备注提取：preferFields 优先级 → 清洗 → 无意义降级 → 截断。 */
    String extractNote(Map<String, String> fields, JSONObject rule, String merchant) {
        JSONObject noteRule = rule.optJSONObject("noteRule");
        if (noteRule == null) return null;

        int maxLength = noteRule.optInt("maxLength", DEFAULT_MAX_LENGTH);
        String[] cleanPatterns = toStringArray(noteRule.optJSONArray("cleanPatterns"));

        // ① 按 preferFields 优先级取第一个"有意义"的字段值
        JSONArray prefer = noteRule.optJSONArray("preferFields");
        if (prefer != null) {
            for (int i = 0; i < prefer.length(); i++) {
                String label = prefer.optString(i, "");
                String v = fields.get(label);
                if (v == null || v.isEmpty()) continue;
                // 纯订单号（如"京东-订单编号3667…"）：清洗后无实质内容 → 视为无意义，降级下一字段
                if (isPureOrderNo(v)) continue;
                String cleaned = cleanNote(v, cleanPatterns);
                if (isMeaningful(cleaned)) {
                    return truncate(cleaned, maxLength);
                }
                // 无意义则继续下一优先字段
            }
        }

        // ② 降级到商户全称
        if (noteRule.optBoolean("fallbackToMerchant", false)
                && merchant != null && !merchant.isEmpty()) {
            String cleaned = cleanNote(merchant, cleanPatterns);
            if (isMeaningful(cleaned)) {
                return truncate(cleaned, maxLength);
            }
        }
        return null;
    }

    /**
     * 是否为"纯订单号"形式的值：含"订单编号"+长数字，且剔除订单号与连接符后
     * 剩余实质内容 ≤ 4 字符（如"京东-订单编号3667279014011752"→"京东"）。
     * PRD §6.5：此类值无备注语义，应降级到商户全称。
     */
    static boolean isPureOrderNo(String raw) {
        if (raw == null || !raw.contains("订单编号")) return false;
        String residue = raw.replaceAll("订单编号\\d+", "")
                .replaceAll("[-–_\\s：:]", "");
        return residue.length() <= 4;
    }

    /** 清洗备注：删除 cleanPatterns 匹配子串 + 脱敏星号尾缀 + 压缩空白 + 去残留连接符。 */
    static String cleanNote(String raw, String[] cleanPatterns) {
        String s = raw == null ? "" : raw;
        // 删除配置的尾缀模式（如订单编号\d+$、App-\d+$、-\d{6,}$）
        if (cleanPatterns != null) {
            for (String p : cleanPatterns) {
                try {
                    s = Pattern.compile(p).matcher(s).replaceAll("");
                } catch (Exception ignored) {
                }
            }
        }
        // 脱敏星号尾缀：燃气费-*贤萍 → 燃气费
        s = s.replaceAll("[-–]\\*+[^-–]*$", "");
        // 清洗后残留的尾部连接符（如"京东-"）
        s = s.replaceAll("[-–：:]\\s*$", "").trim();
        // 压缩连续空白 + 去首尾
        s = s.replaceAll("\\s+", " ").trim();
        return s;
    }

    /** 是否有意义：非空、非 UI 噪声、非纯编号、且剔除数字/符号后实义汉字 ≥3。 */
    static boolean isMeaningful(String s) {
        if (s == null || s.isEmpty()) return false;
        if (isUiNoise(s)) return false;
        if (s.matches(".*订单编号\\d+.*")) return false;
        // 剔除数字/字母/分隔符后剩余的纯中文 = 实义内容
        String hanOnly = s.replaceAll("[^\\u4e00-\\u9fa5]", "");
        // 实义中文不足 3 字 → 无信息量（如商家备注"33785925|兑现"剔完只剩"兑现"）→ 降级
        if (hanOnly.length() < 3) return false;
        // 纯编号：无任何中文且字母数字串 ≥8（如 "TS3378592522"）→ 无意义
        String alnum = s.replaceAll("[^0-9A-Za-z]", "");
        if (hanOnly.isEmpty() && alnum.length() >= 8) return false;
        return true;
    }

    /**
     * 提取订单金额与实付的差额（红包/优惠）。
     * @return [orderMinor, discountMinor]，订单金额 > 实付时返回，否则 null。
     */
    long[] extractDiscount(Map<String, String> fields, JSONObject rule, long paidMinor) {
        JSONObject aliases = rule.optJSONObject("fieldAliases");
        if (aliases == null) return null;
        // 原价字段两种叫法都认：orderAmountLabel（订单金额）/ originalPriceLabel（原价）
        JSONArray orderLabels = aliases.optJSONArray("orderAmountLabel");
        JSONArray originalLabels = aliases.optJSONArray("originalPriceLabel");
        int total = (orderLabels != null ? orderLabels.length() : 0)
                + (originalLabels != null ? originalLabels.length() : 0);
        for (int i = 0; i < total; i++) {
            String label = i < (orderLabels != null ? orderLabels.length() : 0)
                    ? orderLabels.optString(i, "")
                    : originalLabels.optString(i - (orderLabels != null ? orderLabels.length() : 0), "");
            String v = fields.get(label);
            if (v == null || v.isEmpty()) continue;
            // 优惠值可能带文字前缀（"银行卡多笔立减优惠¥1.00"）——提取值中第一个金额形态
            AmountResult order = null;
            Matcher am = AMOUNT_PATTERN.matcher(v);
            while (am.find()) {
                int dg = 2;
                int ds = am.start(dg);
                int de = am.end(dg);
                if ((ds > 0 && Character.isDigit(v.charAt(ds - 1)))
                        || (de < v.length() && Character.isDigit(v.charAt(de)))) {
                    continue; // 长数字串片段
                }
                AmountResult cand = parseAmount(am.group(0));
                if (cand != null) {
                    order = cand;
                    break;
                }
            }
            if (order != null && order.minor > paidMinor) {
                return new long[]{order.minor, order.minor - paidMinor};
            }
        }
        return null;
    }

    /** 分 → 元字符串（固定两位小数，如 3000 → "30.00"、2850 → "28.50"）。 */
    static String formatYuan(long minor) {
        java.math.BigDecimal yuan = new java.math.BigDecimal(minor).divide(new java.math.BigDecimal(100));
        return yuan.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private String truncate(String s, int maxLength) {
        if (s == null) return null;
        if (maxLength > 0 && s.length() > maxLength) {
            return s.substring(0, maxLength);
        }
        return s;
    }

    private static String[] toStringArray(JSONArray arr) {
        if (arr == null) return new String[0];
        String[] out = new String[arr.length()];
        for (int i = 0; i < arr.length(); i++) out[i] = arr.optString(i, "");
        return out;
    }

    // ============ 方向判断 ============

    /**
     * 方向判断（PRD §6.6）：以字段结构为准，符号为辅。
     * 负金额 → expense；否则按字段组合判定。
     */
    String decideDirection(String text, Map<String, String> fields,
                                   boolean negative, JSONObject rule) {
        JSONObject dirRule = rule.optJSONObject("directionRule");
        if (dirRule == null) {
            return negative ? "expense" : "confirm";
        }

        // 负金额 → 支出（自动）
        if (negative) return "expense";

        // 外部打款信号（任一命中 → income）：
        //   对方账户（外部实体）；转账备注（外部转账/收款特有字段——自账户划转页没有它）
        boolean hasExternalIncome = hasAny(text, fields,
                toStringArray(dirRule.optJSONArray("externalIncomeFields")));
        if (!hasExternalIncome) {
            String legacy = dirRule.optString("externalIncomeField", "");
            if (!legacy.isEmpty() && hasAny(text, fields, legacy)) hasExternalIncome = true;
        }
        if (hasExternalIncome) return "income";
        // 自账户划转：提现到/收款方式/处理进度 且无外部打款信号 → transfer
        boolean hasSelfTransfer = hasAny(text, fields,
                toStringArray(dirRule.optJSONArray("selfTransferFields")));
        if (hasSelfTransfer) return "transfer";
        // 退款
        boolean hasRefund = hasAny(text, fields,
                toStringArray(dirRule.optJSONArray("refundFields")));
        if (hasRefund) return "refund";

        String def = dirRule.optString("default", "confirm");
        return def.isEmpty() ? "confirm" : def;
    }

    private boolean hasAny(String text, Map<String, String> fields, String... keys) {
        for (String k : keys) {
            if (k == null || k.isEmpty()) continue;
            if (fields.containsKey(k)) return true;
            if (text.contains(k)) return true;
        }
        return false;
    }

    // ============ 分类建议 ============

    /** 分类建议：备注 + 商户合并匹配 categoryMappings（倒序遍历，后定义优先）；无命中回退规则默认分类。 */
    String suggestCategory(String note, String merchant, JSONObject rule) {
        JSONArray mappings = rule.optJSONArray("categoryMappings");

        StringBuilder combined = new StringBuilder();
        if (note != null) combined.append(note).append(' ');
        if (merchant != null) combined.append(merchant);
        String target = combined.toString().trim();

        if (mappings == null || mappings.length() == 0) return null;

        for (int i = mappings.length() - 1; i >= 0; i--) {
            try {
                JSONObject mapping = mappings.getJSONObject(i);
                String namePattern = mapping.optString("namePattern", "");
                if (namePattern.isEmpty()) continue;
                String catId = mapping.optString("categoryId", "");
                if (catId.isEmpty()) continue;
                Pattern p = Pattern.compile(namePattern, Pattern.CASE_INSENSITIVE);
                if (p.matcher(target).find()) {
                    String kind = mapping.optString("kind", "expense");
                    return kind + ":" + catId;
                }
            } catch (Exception ignored) {
            }
        }

        // 无命中：回退规则默认分类（如红包→income-other，kind 取同 id 映射的 kind）
        String defCat = rule.optString("defaultCategoryId", "");
        if (!defCat.isEmpty()) {
            String kind = "expense";
            for (int i = 0; i < mappings.length(); i++) {
                JSONObject mapping = mappings.optJSONObject(i);
                if (mapping != null && defCat.equals(mapping.optString("categoryId", ""))) {
                    kind = mapping.optString("kind", "expense");
                    break;
                }
            }
            return kind + ":" + defCat;
        }
        return null;
    }
}
