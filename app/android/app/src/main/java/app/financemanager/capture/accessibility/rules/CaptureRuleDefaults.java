package app.financemanager.capture.accessibility.rules;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 原生侧默认规则（当 SharedPreferences 为空时的兜底）。
 *
 * 与前端 capture-rule-config-service.ts 的 DEFAULT_RULES 保持同步。
 * 前端规则修改后，通过 saveRuleConfig() 会同步到原生侧。
 * 这里用于首次安装、清除配置后的兜底。
 */
public final class CaptureRuleDefaults {

    private CaptureRuleDefaults() {}

    /** 内置默认规则 JSON 字符串（运行时通过 JSONObject 构建）。 */
    public static final String DEFAULT_CONFIG_JSON = initConfig();

    private static String initConfig() {
        try {
            return buildDefaultConfig().toString();
        } catch (org.json.JSONException e) {
            return "{}";
        }
    }

    private static JSONObject buildDefaultConfig() throws org.json.JSONException {
        JSONObject config = new JSONObject();
        config.put("version", 1);
        config.put("rules", new JSONArray().put(alipayRule()).put(wechatRule())
                .put(jdRule()).put(meituanRule()).put(douyinRule()));
        JSONObject prefs = new JSONObject();
        prefs.put("quickEntryEnabled", true);
        prefs.put("autoRecoverEnabled", true);
        config.put("preferences", prefs);
        return config;
    }

    private static JSONObject alipayRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "alipay-default");
        rule.put("name", "支付宝");
        rule.put("packageName", "com.eg.android.AlipayGphone");
        rule.put("channel", "accessibility");
        rule.put("successKeywords", new JSONArray()
                .put("支付成功").put("付款成功").put("转账成功").put("交易成功").put("成功"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商家|商户|收款方|对方|店铺|收款人|转入)[:：]?\\s*([^\\n\\r]+)", 1))
                .put(pattern("^([^\\n\\r\\d¥￥创建成功支付付款交易退款提现]*[^\\n\\r\\d¥￥：:])", 1)));
        rule.put("accountPatterns", new JSONArray()
                .put(pattern("(?:支付账户|账户|付款方式|银行卡|储蓄卡|余额宝|余额)[:：]\\s*(.+)", 1)));
        rule.put("enabled", true);
        rule.put("priority", 100);
        return rule;
    }

    private static JSONObject wechatRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "wechat-default");
        rule.put("name", "微信");
        rule.put("packageName", "com.tencent.mm");
        rule.put("channel", "accessibility");
        rule.put("successKeywords", new JSONArray()
                .put("支付成功").put("付款成功").put("交易成功").put("成功"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商户|商家|收款方)[:：]\\s*(.+)", 1)));
        rule.put("accountPatterns", new JSONArray());
        rule.put("enabled", true);
        rule.put("priority", 100);
        return rule;
    }

    private static JSONObject jdRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "jd-default");
        rule.put("name", "京东");
        rule.put("packageName", "com.jingdong.app.mall");
        rule.put("channel", "accessibility");
        rule.put("successKeywords", new JSONArray()
                .put("成功").put("支付").put("付款"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商家|商户|收款方)[:：]\\s*(.+)", 1)));
        rule.put("accountPatterns", new JSONArray());
        rule.put("enabled", true);
        rule.put("priority", 50);
        return rule;
    }

    private static JSONObject meituanRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "meituan-default");
        rule.put("name", "美团");
        rule.put("packageName", "com.sankuai.meituan");
        rule.put("channel", "accessibility");
        rule.put("successKeywords", new JSONArray()
                .put("成功").put("支付").put("付款"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商家|商户|收款方)[:：]\\s*(.+)", 1)));
        rule.put("accountPatterns", new JSONArray());
        rule.put("enabled", true);
        rule.put("priority", 50);
        return rule;
    }

    private static JSONObject douyinRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "douyin-default");
        rule.put("name", "抖音");
        rule.put("packageName", "com.ss.android.ugc.aweme");
        rule.put("channel", "accessibility");
        rule.put("successKeywords", new JSONArray()
                .put("成功").put("支付").put("付款"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商家|商户|收款方)[:：]\\s*(.+)", 1)));
        rule.put("accountPatterns", new JSONArray());
        rule.put("enabled", true);
        rule.put("priority", 50);
        return rule;
    }

    private static JSONObject pattern(String regex, int group) throws org.json.JSONException {
        JSONObject p = new JSONObject();
        p.put("regex", regex);
        p.put("group", group);
        return p;
    }
}