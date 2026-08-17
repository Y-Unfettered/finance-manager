package app.financemanager.capture.accessibility.rules;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 捕获规则存储（SharedPreferences + JSON）。
 *
 * 规则以 JSON 字符串形式存于 SharedPreferences，键名为 "capture_rule_config"。
 * 前端通过 PaymentCapturePlugin.saveCaptureRules() 同步到原生侧。
 *
 * 规则格式（版本 1）：
 * {
 *   "version": 1,
 *   "rules": [
 *     {
 *       "id": "alipay-default",
 *       "name": "支付宝",
 *       "packageName": "com.eg.android.AlipayGphone",
 *       "channel": "accessibility",
 *       "successKeywords": ["支付成功", "付款成功"],
 *       "amountPatterns": [{"regex": "[¥￥]\\s*(\\d+[\\.\\d]*)", "group": 1}],
 *       "merchantPatterns": [...],
 *       "accountPatterns": [...],
 *       "categoryMappings": [{"namePattern": "...", "categoryId": "food", "kind": "expense"}],
 *       "enabled": true,
 *       "priority": 100
 *     }
 *   ],
 *   "preferences": {
 *     "quickEntryEnabled": true,
 *     "autoRecoverEnabled": true
 *   }
 * }
 */
public final class CaptureRuleStorage {

    private static final String TAG = "CaptureRuleStorage";
    private static final String PREFS_NAME = "capture_rules_prefs";
    private static final String KEY_CONFIG = "capture_rule_config";

    private CaptureRuleStorage() {}

    /** 加载规则配置 JSON 字符串。 */
    public static String loadConfig(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY_CONFIG, "");
            if (raw != null && !raw.isEmpty()) {
                Log.d(TAG, "加载规则配置: " + raw.length() + " 字符");
                return raw;
            }
        } catch (Exception e) {
            Log.w(TAG, "加载规则配置失败", e);
        }
        return "";
    }

    /** 保存规则配置 JSON 字符串。 */
    public static void saveConfig(Context context, String configJson) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_CONFIG, configJson).apply();
            Log.d(TAG, "已保存规则配置: " + (configJson != null ? configJson.length() : 0) + " 字符");
        } catch (Exception e) {
            Log.e(TAG, "保存规则配置失败", e);
        }
    }

    /** 清除规则配置。 */
    public static void clearConfig(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().remove(KEY_CONFIG).apply();
        } catch (Exception e) {
            Log.w(TAG, "清除规则配置失败", e);
        }
    }
}