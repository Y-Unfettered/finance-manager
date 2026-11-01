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

    /** 加载规则配置 JSON 字符串。旧版本（version < 3，宽松匹配）自动升级为内置最新规则。 */
    public static String loadConfig(Context context) {
        bindContext(context.getApplicationContext());
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY_CONFIG, "");
            if (raw != null && !raw.isEmpty()) {
                int version = parseVersion(raw);
                if (version > 0 && version < CaptureRuleDefaults.CURRENT_VERSION) {
                    // 旧版规则抓的待确认数据不可信（变体标签没配齐时的误抓），升级时一并清理
                    clearPendingCaptures();
                    // 升级为内置最新规则并回写（只发生一次）
                    String upgraded = CaptureRuleDefaults.DEFAULT_CONFIG_JSON;
                    saveConfig(context, upgraded);
                    Log.i(TAG, "规则版本 " + version + " 旧于 " + CaptureRuleDefaults.CURRENT_VERSION
                            + "，已升级为内置最新规则并清理旧捕获");
                    return upgraded;
                }
                Log.d(TAG, "加载规则配置: " + raw.length() + " 字符");
                return raw;
            }
        } catch (Exception e) {
            Log.w(TAG, "加载规则配置失败", e);
        }
        return "";
    }

    /** 清理旧规则版本的遗留：pending 状态的待确认队列与指纹（confirmed/已入账保留）。 */
    private static void clearPendingCaptures() {
        java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            try {
                app.financemanager.local.capture.CaptureQueueDao dao =
                        app.financemanager.local.capture.CaptureQueueDatabase
                                .getInstance(contextOfApp).captureQueueDao();
                dao.clearPendingFingerprints();
                dao.deletePendingEvents();
                Log.i(TAG, "已清理旧版本的待确认捕获与指纹");
            } catch (Exception e) {
                Log.w(TAG, "清理旧捕获失败", e);
            } finally {
                executor.shutdown();
            }
        });
    }

    private static android.content.Context contextOfApp;

    /** 由调用方注入 Context（loadConfig 持有的 context 即应用上下文）。 */
    static void bindContext(android.content.Context ctx) {
        contextOfApp = ctx;
    }

    /** 解析配置 JSON 的 version 字段；解析失败返回 -1（不触发升级）。 */
    private static int parseVersion(String raw) {
        try {
            return new JSONObject(raw).optInt("version", -1);
        } catch (Exception e) {
            return -1;
        }
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