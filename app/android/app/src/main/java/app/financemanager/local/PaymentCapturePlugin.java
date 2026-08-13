package app.financemanager.local;

import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import app.financemanager.local.capture.CaptureQueueDao;
import app.financemanager.local.capture.CaptureQueueDatabase;
import app.financemanager.local.capture.CaptureQueueEntity;

import java.util.List;
import java.util.Random;

/**
 * 自动记账捕获插件。
 *
 * 为「待确认账单」页面提供：
 * - getServiceHealth(): 查询各通道服务状态
 * - listPendingEvents(): 读取 Room 捕获队列中的待确认记录
 * - acknowledgeEvents(): 标记已确认，从队列中删除
 * - deleteCapturedEvent(): 单条删除
 * - openAccessibilitySettings(): 跳转无障碍设置
 * - openNotificationAccessSettings(): 跳转通知权限设置
 * - runSelfTest(): 注入一条测试记录验证队列写入
 *
 * 架构复用 ClipboardReaderPlugin 模式：原生插件 → Capacitor 桥接 → Vue 前端。
 *
 * 注意：Room 使用 autoGenerate long id。前端传入的字符串 id 通过 UUID hash 映射为 long，
 * 同时用 rawFingerprint 做业务去重。
 */
@CapacitorPlugin(name = "PaymentCapture")
public class PaymentCapturePlugin extends Plugin {

    private static final String TAG = "PaymentCapture";

    /** 事件名：捕获队列变化时推送到前端 */
    public static final String EVENT_CANDIDATE = "paymentCaptureCandidate";
    public static final String EVENT_SERVICE_HEALTH = "paymentCaptureServiceHealth";

    /** 测试事件版本号 */
    public static final String PARSER_VERSION = "0.1.0";

    @PluginMethod
    public void getServiceHealth(PluginCall call) {
        JSObject ret = new JSObject();

        // AccessibilityService 状态：查询系统设置
        JSObject accessibility = new JSObject();
        try {
            boolean enabled = isAccessibilityServiceEnabled();
            accessibility.put("enabled", enabled);
            accessibility.put("configured", true);
            accessibility.put("status", enabled ? "enabled" : "disabled");
        } catch (Exception e) {
            Log.w(TAG, "getServiceHealth: accessibility 查询失败", e);
            accessibility.put("enabled", false);
            accessibility.put("configured", false);
            accessibility.put("status", "error");
        }
        ret.put("accessibility", accessibility);

        // NotificationListener 状态：查询系统设置
        JSObject notification = new JSObject();
        try {
            boolean enabled = isNotificationListenerEnabled();
            notification.put("enabled", enabled);
            notification.put("status", enabled ? "enabled" : "disabled");
        } catch (Exception e) {
            Log.w(TAG, "getServiceHealth: notification 查询失败", e);
            notification.put("enabled", false);
            notification.put("status", "error");
        }
        ret.put("notification", notification);

        // OCR 状态：ML Kit 可用
        JSObject ocr = new JSObject();
        ocr.put("enabled", true);
        ocr.put("status", "available");
        ret.put("ocr", ocr);

        // 捕获队列待确认条数
        try {
            CaptureQueueDao dao = getDao();
            long pending = dao.pendingCount();
            ret.put("pendingCount", pending);
        } catch (Exception e) {
            Log.w(TAG, "getServiceHealth: 获取 pendingCount 失败", e);
            ret.put("pendingCount", -1);
        }

        call.resolve(ret);
    }

    /**
     * 检查无障碍服务是否已在系统设置中启用。
     *
     * Android 在 Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES 中存储
     * `<app_id>/<component_name>` 形式的列表，多个服务用冒号(:)分隔。
     * 小米澎湃 OS 等定制 ROM 会用短 ID 替代包名，
     * 所以匹配时同时检查完整类名和短类名。
     */
    private boolean isAccessibilityServiceEnabled() {
        String settingValue = Settings.Secure.getString(
                getContext().getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (settingValue == null || settingValue.isEmpty()) {
            Log.d(TAG, "无障碍未启用: settings 为空");
            return false;
        }

        String className = "app.financemanager.capture.accessibility.PaymentAccessibilityService";
        Log.d(TAG, "无障碍设置值: " + settingValue);

        if (settingValue.contains(className)) {
            Log.d(TAG, "无障碍已启用 (完整类名匹配)");
            return true;
        }
        if (settingValue.contains("PaymentAccessibilityService")) {
            Log.d(TAG, "无障碍已启用 (类名匹配)");
            return true;
        }

        Log.d(TAG, "无障碍未启用: 设置值中未找到匹配");
        return false;
    }

    /**
     * 检查通知监听权限是否已授予。
     */
    private boolean isNotificationListenerEnabled() {
        String packageName = getContext().getPackageName();
        String enabledPackages = Settings.Secure.getString(
                getContext().getContentResolver(),
                "enabled_notification_listeners");
        if (enabledPackages == null) return false;
        return enabledPackages.contains(packageName);
    }

    @PluginMethod
    public void listPendingEvents(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            CaptureQueueDao dao = getDao();
            List<CaptureQueueEntity> events = dao.getPendingEvents();
            JSArray arr = new JSArray();
            for (CaptureQueueEntity e : events) {
                arr.put(entityToJS(e));
            }
            ret.put("events", arr);
            ret.put("count", events.size());
        } catch (Exception e) {
            Log.w(TAG, "listPendingEvents: 失败", e);
            ret.put("events", new JSArray());
            ret.put("count", 0);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void acknowledgeEvents(PluginCall call) {
        JSArray ids;
        try {
            ids = call.getArray("ids", new JSArray());
        } catch (Exception e) {
            ids = new JSArray();
        }
        CaptureQueueDao dao = getDao();
        long[] longIds = new long[ids.length()];
        for (int i = 0; i < ids.length(); i++) {
            try {
                Object val = ids.get(i);
                if (val instanceof Number) {
                    longIds[i] = ((Number) val).longValue();
                } else if (val instanceof String) {
                    longIds[i] = Long.parseLong((String) val);
                }
            } catch (Exception e) {
                Log.w(TAG, "acknowledgeEvents: 解析 id[" + i + "] 失败", e);
            }
        }
        try {
            dao.acknowledge(longIds);
        } catch (Exception e) {
            Log.w(TAG, "acknowledgeEvents: 批量确认失败", e);
        }
        call.resolve();
    }

    @PluginMethod
    public void deleteCapturedEvent(PluginCall call) {
        Object idVal;
        try {
            idVal = call.getData().get("id");
        } catch (Exception e) {
            idVal = null;
        }
        if (idVal == null) {
            call.reject("缺少 id 参数");
            return;
        }
        try {
            long id = (idVal instanceof Number) ? ((Number) idVal).longValue() : Long.parseLong((String) idVal);
            CaptureQueueDao dao = getDao();
            dao.delete(id);
        } catch (NumberFormatException e) {
            call.reject("无效 id: " + idVal);
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            call.reject("无法打开无障碍设置: " + e.getMessage());
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            call.reject("无法打开通知权限设置: " + e.getMessage());
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void runSelfTest(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            CaptureQueueDao dao = getDao();
            String fingerprint = "self_test_" + randomToken();
            CaptureQueueEntity test = new CaptureQueueEntity();
            test.setSourcePackage("com.financemanager.test");
            test.setSourceName("财务经理-自检");
            test.setCaptureMethod("self_test");
            test.setOccurredAt(String.valueOf(System.currentTimeMillis()));
            test.setAmountMinor(999L);
            test.setCurrency("CNY");
            test.setMerchant("自检商户");
            test.setAccountHint("测试账户");
            test.setConfidence(1.0f);
            test.setParserVersion(PARSER_VERSION);
            test.setRawFingerprint(fingerprint);
            test.setStatus("pending");
            test.setCreatedAt(System.currentTimeMillis());
            dao.insert(test);
            ret.put("success", true);
            ret.put("fingerprint", fingerprint);
            ret.put("message", "自检记录已写入捕获队列");
        } catch (Exception e) {
            Log.w(TAG, "runSelfTest: 失败", e);
            ret.put("success", false);
            ret.put("message", e.getMessage());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void addCapturedEvent(PluginCall call) {
        JSObject options = call.getObject("options", new JSObject());
        try {
            CaptureQueueDao dao = getDao();
            CaptureQueueEntity entity = new CaptureQueueEntity();
            entity.setSourcePackage(options.getString("sourcePackage", ""));
            entity.setSourceName(options.getString("sourceName", ""));
            entity.setCaptureMethod(options.getString("captureMethod", "unknown"));
            entity.setOccurredAt(options.getString("occurredAt", String.valueOf(System.currentTimeMillis())));
            entity.setAmountMinor((long) options.optInt("amountMinor", 0));
            entity.setCurrency(options.optString("currency", "CNY"));
            entity.setMerchant(options.optString("merchant", ""));
            entity.setAccountHint(options.optString("accountHint", ""));
            entity.setSourceOrderId(options.optString("sourceOrderId", ""));
            entity.setRawFingerprint(options.optString("rawFingerprint", randomToken()));
            entity.setConfidence((float) options.optDouble("confidence", 1.0));
            entity.setParserVersion(options.getString("parserVersion", PARSER_VERSION));
            entity.setStatus("pending");
            entity.setCreatedAt(System.currentTimeMillis());
            dao.insert(entity);

            JSObject result = entityToJS(entity);
            Log.d(TAG, "addCapturedEvent: 已插入 id=" + entity.getId());
            notifyListeners(EVENT_CANDIDATE, result);
            call.resolve(result);
        } catch (Exception e) {
            Log.w(TAG, "addCapturedEvent: 失败", e);
            call.reject("写入捕获队列失败: " + e.getMessage());
        }
    }

    /** 向 WebView 推送捕获事件（供原生服务调用）。 */
    public void notifyCaptureCandidate(CaptureQueueEntity entity) {
        if (bridge == null) {
            Log.d(TAG, "notifyCaptureCandidate: bridge 不可用，跳过推送");
            return;
        }
        JSObject payload = entityToJS(entity);
        notifyListeners(EVENT_CANDIDATE, payload);
    }

    private CaptureQueueDao getDao() {
        return CaptureQueueDatabase.getInstance(getContext()).captureQueueDao();
    }

    private String randomToken() {
        Random r = new Random(System.nanoTime());
        byte[] bytes = new byte[4];
        r.nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    private JSObject entityToJS(CaptureQueueEntity e) {
        JSObject obj = new JSObject();
        obj.put("id", e.getId());
        obj.put("sourcePackage", e.getSourcePackage() != null ? e.getSourcePackage() : "");
        obj.put("sourceName", e.getSourceName() != null ? e.getSourceName() : "");
        obj.put("captureMethod", e.getCaptureMethod() != null ? e.getCaptureMethod() : "");
        obj.put("occurredAt", e.getOccurredAt());
        obj.put("amountMinor", e.getAmountMinor());
        obj.put("amount", e.getAmountMinor() != null ? e.getAmountMinor() / 100.0 : 0.0);
        obj.put("currency", e.getCurrency() != null ? e.getCurrency() : "CNY");
        obj.put("merchant", e.getMerchant() != null ? e.getMerchant() : "");
        obj.put("accountHint", e.getAccountHint() != null ? e.getAccountHint() : "");
        obj.put("sourceOrderId", e.getSourceOrderId() != null ? e.getSourceOrderId() : "");
        obj.put("rawFingerprint", e.getRawFingerprint() != null ? e.getRawFingerprint() : "");
        obj.put("confidence", e.getConfidence());
        obj.put("parserVersion", e.getParserVersion() != null ? e.getParserVersion() : PARSER_VERSION);
        obj.put("status", e.getStatus() != null ? e.getStatus() : "pending");
        obj.put("createdAt", e.getCreatedAt());
        return obj;
    }
}