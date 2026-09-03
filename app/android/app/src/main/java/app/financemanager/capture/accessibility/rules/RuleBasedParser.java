package app.financemanager.capture.accessibility.rules;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import app.financemanager.capture.accessibility.AccessibilityDiagnostics;
import app.financemanager.capture.accessibility.CapturedPaymentInfo;
import app.financemanager.capture.accessibility.PaymentParserAdapter;
import app.financemanager.capture.accessibility.PaymentParserRegistry;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 基于规则的支付解析器。
 *
 * 从 CaptureRuleStorage 加载 JSON 规则，按包名匹配规则，动态应用正则提取支付信息。
 * 规则优先级：rules 数组中 priority 最大的匹配规则生效。
 *
 * 如果没有匹配的规则，回退到 PaymentParserRegistry 中预置的适配器。
 *
 * 使用方式：
 *   RuleBasedParser parser = new RuleBasedParser(context);
 *   CapturedPaymentInfo info = parser.parse(service, root, packageName);
 */
public class RuleBasedParser {

    private static final String TAG = "RuleBasedParser";
    private static final Pattern CATEGORY_MAP_KEY = Pattern.compile("categoryId");
    private static final Pattern CATEGORY_MAP_KIND = Pattern.compile("kind");
    private static final Pattern CATEGORY_MAP_PATTERN = Pattern.compile("namePattern");

    private final Object configCacheLock = new Object();
    private String configJsonCache = "";
    private long configCacheTime = 0;
    private static final long CONFIG_CACHE_TTL = 10_000; // 10 秒缓存

    private String getConfigJson(android.content.Context context) {
        long now = System.currentTimeMillis();
        synchronized (configCacheLock) {
            if (now - configCacheTime > CONFIG_CACHE_TTL) {
                configJsonCache = CaptureRuleStorage.loadConfig(context);
                configCacheTime = now;
            }
        }
        // 如果 SharedPreferences 为空（首次安装/清除配置），使用内置默认规则
        if (configJsonCache == null || configJsonCache.isEmpty()) {
            return CaptureRuleDefaults.DEFAULT_CONFIG_JSON;
        }
        return configJsonCache;
    }

    /**
     * 按包名查找匹配的规则，并解析窗口文本。
     *
     * @return 解析结果，null 表示无法解析
     */
    public CapturedPaymentInfo parse(
            AccessibilityService service,
            AccessibilityNodeInfo root,
            String packageName) {

        String configJson = getConfigJson(service.getApplicationContext());
        if (configJson == null || configJson.isEmpty()) {
            return null;
        }

        JSONObject rule = findBestRule(configJson, packageName);
        if (rule == null) {
            Log.d(TAG, "无匹配规则: " + packageName);
            return null;
        }

        String text = PaymentParserAdapter.extractVisibleText(root);
        if (text == null || text.isEmpty()) {
            AccessibilityDiagnostics.textEmpty(packageName);
            return null;
        }

        try {
            return applyRule(text, packageName, rule);
        } catch (Exception e) {
            Log.w(TAG, "应用规则异常: " + packageName, e);
            return null;
        }
    }

    /** 从 JSON 中查找最佳匹配规则。 */
    private JSONObject findBestRule(String configJson, String packageName) {
        JSONObject bestRule = null;
        int bestPriority = -1;

        try {
            JSONObject config = new JSONObject(configJson);
            JSONArray rules = config.optJSONArray("rules");
            if (rules == null) return null;

            for (int i = 0; i < rules.length(); i++) {
                JSONObject rule = rules.getJSONObject(i);
                if (!rule.optBoolean("enabled", true)) continue;
                String pkg = rule.optString("packageName", "");
                if (!pkg.equals(packageName)) continue;
                int priority = rule.optInt("priority", 0);
                if (priority > bestPriority) {
                    bestPriority = priority;
                    bestRule = rule;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "解析规则 JSON 失败", e);
        }
        return bestRule;
    }

    /** 应用单条规则解析文本。 */
    private CapturedPaymentInfo applyRule(String text, String packageName, JSONObject rule)
            throws Exception {
        // 1. 检查成功关键词
        JSONArray keywords = rule.optJSONArray("successKeywords");
        boolean hasKeyword = false;
        if (keywords != null && keywords.length() > 0) {
            for (int i = 0; i < keywords.length(); i++) {
                if (text.contains(keywords.getString(i))) {
                    hasKeyword = true;
                    break;
                }
            }
        } else {
            // 无关键词时默认检查"成功"、"支付"、"付款"
            hasKeyword = text.contains("成功") || text.contains("支付") || text.contains("付款");
        }
        if (!hasKeyword) {
            AccessibilityDiagnostics.noKeyword(packageName,
                    text.substring(0, Math.min(text.length(), 80)));
            return null;
        }

        // 2. 构建结果
        CapturedPaymentInfo info = new CapturedPaymentInfo();
        info.setSourcePackage(packageName);
        info.setSourceName(rule.optString("name", packageName));

        // 3. 提取金额
        String amount = extractFirstMatch(text, rule.optJSONArray("amountPatterns"));
        if (amount != null) {
            info.setAmount(amount);
            Long minor = CapturedPaymentInfo.parseAmountMinor(amount);
            info.setAmountMinor(minor);
        }

        // 4. 提取商户
        String merchant = extractFirstMatch(text, rule.optJSONArray("merchantPatterns"));
        if (merchant != null && !merchant.isEmpty()) {
            info.setMerchant(merchant.trim());
        }

        // 5. 提取账户
        String account = extractFirstMatch(text, rule.optJSONArray("accountPatterns"));
        if (account != null && !account.isEmpty()) {
            info.setAccountHint(account.trim());
        }

        // 6. 默认账户（如果规则配置了）
        String defaultAccount = rule.optString("defaultAccountId", "");
        if (defaultAccount != null && !defaultAccount.isEmpty()) {
            info.setDefaultAccountId(defaultAccount);
        }

        // 7. 分类建议
        String suggestedCategory = suggestCategory(text, rule);
        if (suggestedCategory != null && !suggestedCategory.isEmpty()) {
            info.setSuggestedCategory(suggestedCategory);
        }

        if (!info.isHasAmount()) {
            AccessibilityDiagnostics.noAmount(packageName);
            return null;
        }

        AccessibilityDiagnostics.parsed(packageName, info.getAmount(), info.getMerchant());
        Log.d(TAG, "规则解析成功: " + rule.optString("name") + " " + info);
        return info;
    }

    /** 从规则中的 pattern 数组提取第一个匹配的值。 */
    private String extractFirstMatch(String text, JSONArray patterns) {
        if (patterns == null) return null;
        for (int i = 0; i < patterns.length(); i++) {
            try {
                JSONObject p = patterns.getJSONObject(i);
                String regex = p.getString("regex");
                int group = p.optInt("group", 0);
                String match = matchPattern(text, regex, group);
                if (match != null) return match;
            } catch (Exception e) {
                // 跳过有问题的 pattern
            }
        }
        return null;
    }

    /** 匹配单个正则表达式。 */
    private String matchPattern(String text, String regex, int group) {
        try {
            Pattern pattern = Pattern.compile(regex);
            Matcher matcher = pattern.matcher(text);
            if (matcher.find()) {
                return matcher.group(group >= 0 ? Math.min(group, matcher.groupCount()) : 0);
            }
        } catch (Exception e) {
            Log.w(TAG, "正则匹配异常: " + regex, e);
        }
        return null;
    }

    /** 根据商户名和规则中的 categoryMappings 建议分类。 */
    private String suggestCategory(String text, JSONObject rule) {
        try {
            JSONArray mappings = rule.optJSONArray("categoryMappings");
            if (mappings == null || mappings.length() == 0) return null;

            // 先提取商户名
            String merchant = null;
            JSONArray merchantPatterns = rule.optJSONArray("merchantPatterns");
            if (merchantPatterns != null) {
                merchant = extractFirstMatch(text, merchantPatterns);
            }
            if (merchant == null || merchant.isEmpty()) return null;

            // 反向遍历（后定义的优先），找到第一个匹配的分类
            for (int i = mappings.length() - 1; i >= 0; i--) {
                JSONObject mapping = mappings.getJSONObject(i);
                String namePattern = mapping.optString("namePattern", "");
                if (namePattern.isEmpty()) continue;
                String catId = mapping.optString("categoryId", "");
                if (catId.isEmpty()) continue;
                Pattern p = Pattern.compile(namePattern, Pattern.CASE_INSENSITIVE);
                if (p.matcher(merchant).find()) {
                    String kind = mapping.optString("kind", "expense");
                    return kind + ":" + catId;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "分类建议异常", e);
        }
        return null;
    }
}