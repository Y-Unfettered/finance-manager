package app.financemanager.local;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import app.financemanager.capture.shizuku.AccessibilityEnabler;
import app.financemanager.capture.shizuku.ShizukuShell;
import app.financemanager.capture.accessibility.AccessibilityDiagnostics;
import app.financemanager.capture.notification.NotificationDiagnostics;
import app.financemanager.local.capture.CaptureQueueDao;
import app.financemanager.local.capture.CaptureQueueDatabase;
import app.financemanager.local.capture.CaptureQueueEntity;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.TimeZone;

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

    /** 静态单例，供无障碍/通知/分享服务写库后调 notifyCandidate 推给前端。 */
    private static volatile PaymentCapturePlugin INSTANCE;

    /** 事件名：捕获队列变化时推送到前端 */
    public static final String EVENT_CANDIDATE = "paymentCaptureCandidate";
    public static final String EVENT_SERVICE_HEALTH = "paymentCaptureServiceHealth";

    /** 测试事件版本号 */
    public static final String PARSER_VERSION = "0.1.0";

    /** 用于日志辅助的构造器（Capacitor 走 no-arg 构造）。 */
    protected PaymentCapturePlugin() {
        INSTANCE = this;
    }

    /**
     * 供原生服务（无障碍 / 通知 / 分享）调用，把新入库的记录推给前端。
     * 线程安全：INSTANCE 用 volatile，桥接为空时静默跳过。
     */
    public static void notifyCandidate(CaptureQueueEntity entity) {
        PaymentCapturePlugin instance = INSTANCE;
        if (instance == null || instance.bridge == null) {
            Log.d(TAG, "notifyCandidate: 插件未就绪，跳过推送");
            return;
        }
        instance.notifyCaptureCandidate(entity);
    }

    @PluginMethod
    public void diagnose(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("pluginLoaded", true);
        ret.put("message", "PaymentCapturePlugin 已加载，正常工作");

        // 检查 PP-OCR 引擎（通过反射加载，避免在类加载阶段因 native 库问题导致插件无法注册）
        JSObject ocrInfo = new JSObject();
        try {
            Class<?> ocrClass = Class.forName("app.financemanager.capture.share.OfflineOCR");
            java.lang.reflect.Method createMethod = ocrClass.getMethod("create", android.content.Context.class);
            Object ocr = createMethod.invoke(null, getContext());
            if (ocr != null) {
                ocrInfo.put("loaded", true);
                ocrInfo.put("engine", "pp-ocr");
                java.lang.reflect.Method releaseMethod = ocrClass.getMethod("release");
                releaseMethod.invoke(ocr);
            } else {
                ocrInfo.put("loaded", false);
                ocrInfo.put("engine", "pp-ocr");
                ocrInfo.put("error", "PP-OCR 模型初始化返回 null（可能 native 库不兼容）");
            }
        } catch (UnsatisfiedLinkError e) {
            ocrInfo.put("loaded", false);
            ocrInfo.put("engine", "pp-ocr");
            ocrInfo.put("error", "native 库加载失败: " + e.getMessage());
        } catch (ClassNotFoundException e) {
            ocrInfo.put("loaded", false);
            ocrInfo.put("engine", "pp-ocr");
            ocrInfo.put("error", "OfflineOCR 类未找到");
        } catch (java.lang.reflect.InvocationTargetException e) {
            ocrInfo.put("loaded", false);
            ocrInfo.put("engine", "pp-ocr");
            ocrInfo.put("error", "反射调用失败: " + (e.getCause() != null ? e.getCause().getMessage() : e.getMessage()));
        } catch (Exception e) {
            ocrInfo.put("loaded", false);
            ocrInfo.put("engine", "pp-ocr");
            ocrInfo.put("error", e.getMessage());
        }
        ret.put("ocr", ocrInfo);

        // 检查 Shizuku
        JSObject shizukuInfo = new JSObject();
        shizukuInfo.put("running", ShizukuShell.isRunning());
        shizukuInfo.put("supported", ShizukuShell.isSupported());
        shizukuInfo.put("available", ShizukuShell.isAvailable());
        if (ShizukuShell.isSupported()) {
            shizukuInfo.put("version", ShizukuShell.getVersion());
        }
        ret.put("shizuku", shizukuInfo);

        call.resolve(ret);
    }

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

        // OCR 状态：检查 PP-OCR 模型文件是否存在
        // 注意：不在这里加载 OCR 类——PP-OCR 的 OCR 类有 static { System.loadLibrary() } 加载 native 库，
        // 在部分设备上可能抛出 NoClassDefFoundError（Error 而非 Exception），会导致整个 getServiceHealth 崩溃。
        // 实际 OCR 调用在 PaymentShareActivity 中，那里已做好异常处理。
        JSObject ocr = new JSObject();
        try {
            boolean detParam = fileExists("PP_OCRv5_mobile_det.ncnn.param");
            boolean detBin = fileExists("PP_OCRv5_mobile_det.ncnn.bin");
            boolean recParam = fileExists("PP_OCRv5_mobile_rec.ncnn.param");
            boolean recBin = fileExists("PP_OCRv5_mobile_rec.ncnn.bin");

            if (detParam && detBin && recParam && recBin) {
                ocr.put("enabled", true);
                ocr.put("status", "available");
                ocr.put("engine", "pp-ocr");
            } else {
                ocr.put("enabled", false);
                ocr.put("status", "error");
                ocr.put("errorMessage", "PP-OCR 模型文件缺失: det=" + (detParam && detBin) + " rec=" + (recParam && recBin));
            }
        } catch (Exception e) {
            Log.w(TAG, "getServiceHealth: OCR 状态查询失败", e);
            ocr.put("enabled", false);
            ocr.put("status", "error");
            ocr.put("errorMessage", e.getMessage());
        }
        ret.put("ocr", ocr);

        // Shizuku 状态
        JSObject shizuku = new JSObject();
        try {
            boolean available = ShizukuShell.isAvailable();
            boolean running = ShizukuShell.isRunning();
            shizuku.put("available", available);
            shizuku.put("running", running);
            shizuku.put("status", available ? "available" : "unavailable");
            if (ShizukuShell.isSupported()) {
                shizuku.put("version", ShizukuShell.getVersion());
            }
        } catch (Exception e) {
            Log.w(TAG, "getServiceHealth: Shizuku 状态查询失败", e);
            shizuku.put("available", false);
            shizuku.put("running", false);
            shizuku.put("status", "error");
        }
        ret.put("shizuku", shizuku);

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
     * 无障碍服务诊断信息导出（供前端排查"为什么没识别"）。
     * 包括内存计数（进程重启清零）+ 持久化时间戳（可存活的诊断信号）+ 环形日志。
     */
    @PluginMethod
    public void getAccessibilityDiagnostics(PluginCall call) {
        JSObject ret = new JSObject();
        JSObject counts = new JSObject();
        counts.put("serviceConnected", AccessibilityDiagnostics.getServiceConnected());
        counts.put("serviceDestroyed", AccessibilityDiagnostics.getServiceDestroyed());
        counts.put("eventTotal", AccessibilityDiagnostics.getEventTotal());
        counts.put("evtWindowState", AccessibilityDiagnostics.getEvtWindowState());
        counts.put("evtWindowContent", AccessibilityDiagnostics.getEvtWindowContent());
        counts.put("rootNull", AccessibilityDiagnostics.getRootNull());
        counts.put("textEmpty", AccessibilityDiagnostics.getTextEmpty());
        counts.put("noKeyword", AccessibilityDiagnostics.getNoKeyword());
        counts.put("noAmount", AccessibilityDiagnostics.getNoAmount());
        counts.put("parsed", AccessibilityDiagnostics.getParsed());
        counts.put("dedup", AccessibilityDiagnostics.getDedup());
        counts.put("queueInsert", AccessibilityDiagnostics.getQueueInsert());
        counts.put("queueFail", AccessibilityDiagnostics.getQueueFail());
        counts.put("noAdapter", AccessibilityDiagnostics.getNoAdapter());
        ret.put("counts", counts);
        ret.put("lastFailReason", AccessibilityDiagnostics.getLastFailReason() != null
                ? AccessibilityDiagnostics.getLastFailReason() : "");

        // 持久化时间戳（服务进程被系统杀死后内存计数清零，这两个时间戳是"死过"的信号）
        try {
            JSObject persisted = new JSObject();
            persisted.put("lastConnectedAt", AccessibilityDiagnostics.getLastConnectedAt(getContext()));
            persisted.put("lastDestroyedAt", AccessibilityDiagnostics.getLastDestroyedAt(getContext()));
            persisted.put("restartCount", AccessibilityDiagnostics.getRestartCount(getContext()));
            ret.put("persisted", persisted);
        } catch (Exception e) {
            Log.w(TAG, "getAccessibilityDiagnostics: persisted 查询失败", e);
        }

        JSArray ringArr = new JSArray();
        for (String entry : AccessibilityDiagnostics.getRing()) {
            ringArr.put(entry);
        }
        ret.put("ring", ringArr);

        JSArray pkgArr = new JSArray();
        for (String entry : AccessibilityDiagnostics.getPerPkg()) {
            pkgArr.put(entry);
        }
        ret.put("perPkg", pkgArr);

        call.resolve(ret);
    }

    /**
     * 通知监听服务诊断信息导出。
     */
    @PluginMethod
    public void getNotificationDiagnostics(PluginCall call) {
        JSObject ret = new JSObject();
        JSObject counts = new JSObject();
        counts.put("connected", NotificationDiagnostics.getConnected());
        counts.put("disconnected", NotificationDiagnostics.getDisconnected());
        counts.put("notifTotal", NotificationDiagnostics.getNotifTotal());
        counts.put("noKeyword", NotificationDiagnostics.getNoKeyword());
        counts.put("noAmount", NotificationDiagnostics.getNoAmount());
        counts.put("parsed", NotificationDiagnostics.getParsed());
        counts.put("dedup", NotificationDiagnostics.getDedup());
        counts.put("queueInsert", NotificationDiagnostics.getQueueInsert());
        counts.put("queueFail", NotificationDiagnostics.getQueueFail());
        ret.put("counts", counts);

        try {
            JSObject persisted = new JSObject();
            persisted.put("lastConnectedAt", NotificationDiagnostics.getLastConnectedAt(getContext()));
            persisted.put("lastDisconnectedAt", NotificationDiagnostics.getLastDisconnectedAt(getContext()));
            ret.put("persisted", persisted);
        } catch (Exception e) {
            Log.w(TAG, "getNotificationDiagnostics: persisted 查询失败", e);
        }

        JSArray ringArr = new JSArray();
        for (String entry : NotificationDiagnostics.getRing()) {
            ringArr.put(entry);
        }
        ret.put("ring", ringArr);

        call.resolve(ret);
    }

    /**
     * 重置诊断数据（前端"清空诊断"按钮）。
     */
    @PluginMethod
    public void resetDiagnostics(PluginCall call) {
        try {
            AccessibilityDiagnostics.reset(getContext());
            NotificationDiagnostics.reset(getContext());
        } catch (Exception e) {
            Log.w(TAG, "resetDiagnostics: 失败", e);
        }
        call.resolve();
    }

    /**
     * 检查无障碍服务是否已在系统设置中启用。
     *
     * 注意：小米等定制 ROM 会截断 Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES 的值
     * （将包名替换为短 ID），导致 Settings.Secure.getString() 返回的值与实际不一致。
     * 所以改用 AccessibilityManager.getEnabledAccessibilityServiceList() API，
     * 这个 API 会返回完整的 ComponentName。
     */
    private boolean isAccessibilityServiceEnabled() {
        String serviceClass = "app.financemanager.capture.accessibility.PaymentAccessibilityService";

        // 方式1：通过反射使用 AccessibilityManager API（最可靠）
        try {
            Object am = getContext().getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (am != null) {
                Class<?> amClass = am.getClass();
                java.lang.reflect.Method getEnabled = amClass.getMethod(
                        "getEnabledAccessibilityServiceList", int.class);
                @SuppressWarnings("unchecked")
                List<AccessibilityServiceInfo> enabledServices =
                        (List<AccessibilityServiceInfo>) getEnabled.invoke(am,
                                AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
                Log.d(TAG, "AccessibilityManager 返回 " + enabledServices.size() + " 个已启用服务");
                for (AccessibilityServiceInfo info : enabledServices) {
                    String cnStr = info.getId();
                    Log.d(TAG, "  - " + cnStr);
                    if (cnStr.contains(serviceClass) || cnStr.contains("PaymentAccessibilityService")) {
                        Log.d(TAG, "无障碍已启用 (AccessibilityManager 匹配)");
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "AccessibilityManager 查询失败，尝试备用方式", e);
        }

        // 方式2：Settings.Secure（备用，受小米 ROM 影响可能不准）
        try {
            String settingValue = Settings.Secure.getString(
                    getContext().getContentResolver(),
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            if (settingValue != null && !settingValue.isEmpty()) {
                Log.d(TAG, "Settings.Secure enabled_accessibility_services = " + settingValue);
                if (settingValue.contains(serviceClass) || settingValue.contains("PaymentAccessibilityService")) {
                    Log.d(TAG, "无障碍已启用 (Settings.Secure 匹配)");
                    return true;
                }
                // 小米 ROM 可能只存短 ID，检查是否包含我们的包名
                if (settingValue.contains(getContext().getPackageName())) {
                    Log.d(TAG, "无障碍疑似已启用 (包名匹配，但类名不匹配)");
                    return true;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Settings.Secure 查询失败", e);
        }

        Log.d(TAG, "无障碍未启用");
        return false;
    }

    /**
     * 检查通知监听权限是否已授予。
     *
     * 通过 Settings.Secure 查询 "enabled_notification_listeners"。
     * 注意：此 API 在部分 ROM 上可能受权限限制，但这是唯一可靠的通知监听检测方式。
     */
    private boolean isNotificationListenerEnabled() {
        String packageName = getContext().getPackageName();

        // 方式1：通过 ComponentName 检查（最精确）
        try {
            ComponentName cn = new ComponentName(packageName,
                    "app.financemanager.capture.notification.PaymentNotificationListenerService");
            String cnStr = cn.flattenToString();
            Log.d(TAG, "通知监听期望的 ComponentName: " + cnStr);

            String enabledPackages = Settings.Secure.getString(
                    getContext().getContentResolver(),
                    "enabled_notification_listeners");
            if (enabledPackages != null && !enabledPackages.isEmpty()) {
                Log.d(TAG, "Settings.Secure enabled_notification_listeners = " + enabledPackages);
                if (enabledPackages.contains(cnStr)) {
                    Log.d(TAG, "通知监听已启用 (ComponentName 精确匹配)");
                    return true;
                }
                if (enabledPackages.contains(packageName)) {
                    Log.d(TAG, "通知监听疑似已启用 (包名匹配)");
                    return true;
                }
                // 小米 ROM 可能用短 ID，检查是否包含我们的服务名
                if (enabledPackages.contains("PaymentNotificationListenerService")) {
                    Log.d(TAG, "通知监听已启用 (服务名匹配)");
                    return true;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "通知监听查询失败", e);
        }

        Log.d(TAG, "通知监听未启用");
        return false;
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

    /**
     * 通过 Shizuku 自动启用无障碍服务。
     *
     * 原理：Shizuku 以 ADB 权限执行 shell 命令，绕过小米等定制 ROM
     * 对无障碍权限的限制。
     */
    @PluginMethod
    public void enableAccessibilityViaShizuku(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            if (!ShizukuShell.isRunning()) {
                ret.put("success", false);
                ret.put("message", "Shizuku 未运行，请先启动 Shizuku");
                call.resolve(ret);
                return;
            }

            if (!ShizukuShell.isPermissionGranted()) {
                // 请求 Shizuku 授权
                ShizukuShell.requestPermission();
                ret.put("success", false);
                ret.put("message", "请先授权 Shizuku");
                call.resolve(ret);
                return;
            }

            AccessibilityEnabler enabler = new AccessibilityEnabler(getContext());
            boolean success = enabler.tryEnable();
            ret.put("success", success);
            ret.put("message", success ? "无障碍服务已通过 Shizuku 启用" : "启用失败，请手动在系统设置中开启");
        } catch (Exception e) {
            Log.w(TAG, "enableAccessibilityViaShizuku: 失败", e);
            ret.put("success", false);
            ret.put("message", "启用失败: " + e.getMessage());
        }
        call.resolve(ret);
    }

    /**
     * 请求 Shizuku 授权。
     */
    @PluginMethod
    public void requestShizukuPermission(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            if (!ShizukuShell.isRunning()) {
                ret.put("success", false);
                ret.put("message", "Shizuku 未运行");
                call.resolve(ret);
                return;
            }
            ShizukuShell.requestPermission();
            ret.put("success", true);
            ret.put("message", "已请求 Shizuku 授权");
        } catch (Exception e) {
            ret.put("success", false);
            ret.put("message", "请求失败: " + e.getMessage());
        }
        call.resolve(ret);
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

    /** 检查 assets 目录下的文件是否存在。 */
    private boolean fileExists(String path) {
        try (java.io.InputStream is = getContext().getAssets().open(path)) {
            is.close();
            return true;
        } catch (Exception e) {
            return false;
        }
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

    // ========================================================================
    // 诊断日志导出
    // ========================================================================

    /**
     * 收集完整的诊断信息并导出为 JSON 文件。
     * 前端通过 FilePicker / share intent 分享该文件。
     *
     * 包含内容：
     * - 设备信息（型号、Android 版本、ROM）
     * - 无障碍服务状态（含详细检测结果）
     * - 通知监听状态（含详细检测结果）
     * - OCR 引擎状态（PP-OCR 模型文件检查）
     * - Shizuku 状态
     * - 捕获队列状态
     * - 日志时间戳
     */
    @PluginMethod
    public void exportDiagnosticLog(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            org.json.JSONObject diag = new org.json.JSONObject();
            diag.put("timestamp", formatDate("yyyy-MM-dd HH:mm:ss", new Date()));
            diag.put("appVersion", getAppVersion());
            diag.put("appVersionName", getAppVersionName());

            // 设备信息
            org.json.JSONObject device = new org.json.JSONObject();
            device.put("brand", Build.BRAND);
            device.put("manufacturer", Build.MANUFACTURER);
            device.put("model", Build.MODEL);
            device.put("androidVersion", Build.VERSION.RELEASE);
            device.put("apiLevel", Build.VERSION.SDK_INT);
            device.put("product", Build.PRODUCT);
            diag.put("device", device);

            // 无障碍诊断
            org.json.JSONObject accessibility = new org.json.JSONObject();
            String serviceClass = "app.financemanager.capture.accessibility.PaymentAccessibilityService";
            boolean a11yEnabled = false;

            // 通过 AccessibilityManager 检查（反射调用，避免编译时 API 版本问题）
            try {
                Object am = getContext().getSystemService(Context.ACCESSIBILITY_SERVICE);
                if (am != null) {
                    Class<?> amClass = am.getClass();
                    java.lang.reflect.Method getEnabled = amClass.getMethod(
                            "getEnabledAccessibilityServiceList", int.class);
                    @SuppressWarnings("unchecked")
                    List<AccessibilityServiceInfo> enabledServices =
                            (List<AccessibilityServiceInfo>) getEnabled.invoke(am,
                                    AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
                    accessibility.put("managerServiceCount", enabledServices.size());
                    StringBuilder sb = new StringBuilder();
                    for (AccessibilityServiceInfo info : enabledServices) {
                        String cn = info.getId();
                        if (sb.length() > 0) sb.append(", ");
                        sb.append(cn);
                        if (cn.contains("PaymentAccessibilityService")) {
                            a11yEnabled = true;
                        }
                    }
                    accessibility.put("managerServices", sb.toString());
                } else {
                    accessibility.put("managerServiceCount", -1);
                    accessibility.put("managerServices", "AccessibilityManager is null");
                }
            } catch (Exception e) {
                accessibility.put("managerError", e.getClass().getSimpleName() + ": " + e.getMessage());
            }

            // 通过 Settings.Secure 检查
            try {
                String settingValue = Settings.Secure.getString(
                        getContext().getContentResolver(),
                        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
                accessibility.put("settingsValue", settingValue != null ? settingValue : "null/empty");
                if (settingValue != null && settingValue.contains("PaymentAccessibilityService")) {
                    a11yEnabled = true;
                }
            } catch (Exception e) {
                accessibility.put("settingsError", e.getClass().getSimpleName() + ": " + e.getMessage());
            }

            accessibility.put("enabled", a11yEnabled);
            accessibility.put("expectedClass", serviceClass);
            diag.put("accessibility", accessibility);

            // 通知监听诊断
            org.json.JSONObject notification = new org.json.JSONObject();
            boolean notifEnabled = false;

            String notifSetting = null;
            try {
                notifSetting = Settings.Secure.getString(
                        getContext().getContentResolver(),
                        "enabled_notification_listeners");
            } catch (Exception e) {
                notifSetting = "error: " + e.getMessage();
            }
            notification.put("settingsValue", notifSetting != null ? notifSetting : "null/empty");
            if (notifSetting != null && notifSetting.contains(getContext().getPackageName())) {
                notifEnabled = true;
            }
            if (notifSetting != null && notifSetting.contains("PaymentNotificationListenerService")) {
                notifEnabled = true;
            }
            notification.put("enabled", notifEnabled);
            notification.put("packageName", getContext().getPackageName());
            diag.put("notification", notification);

            // OCR 诊断
            org.json.JSONObject ocr = new org.json.JSONObject();
            ocr.put("engine", "pp-ocr");
            boolean detParam = fileExists("PP_OCRv5_mobile_det.ncnn.param");
            boolean detBin = fileExists("PP_OCRv5_mobile_det.ncnn.bin");
            boolean recParam = fileExists("PP_OCRv5_mobile_rec.ncnn.param");
            boolean recBin = fileExists("PP_OCRv5_mobile_rec.ncnn.bin");
            ocr.put("detParam", detParam);
            ocr.put("detBin", detBin);
            ocr.put("recParam", recParam);
            ocr.put("recBin", recBin);
            ocr.put("available", detParam && detBin && recParam && recBin);
            diag.put("ocr", ocr);

            // Shizuku 诊断
            org.json.JSONObject shizuku = new org.json.JSONObject();
            shizuku.put("supported", ShizukuShell.isSupported());
            shizuku.put("running", ShizukuShell.isRunning());
            shizuku.put("available", ShizukuShell.isAvailable());
            shizuku.put("permissionGranted", ShizukuShell.isPermissionGranted());
            if (ShizukuShell.isSupported()) {
                shizuku.put("version", ShizukuShell.getVersion());
            }
            diag.put("shizuku", shizuku);

            // 捕获队列诊断
            try {
                CaptureQueueDao dao = getDao();
                diag.put("pendingCount", dao.pendingCount());
            } catch (Exception e) {
                diag.put("pendingCount", -1);
            }

            // 无障碍诊断（计数 + 环形日志 + 每包统计）
            org.json.JSONObject a11y = new org.json.JSONObject();
            a11y.put("serviceConnected", AccessibilityDiagnostics.getServiceConnected());
            a11y.put("serviceDestroyed", AccessibilityDiagnostics.getServiceDestroyed());
            a11y.put("eventTotal", AccessibilityDiagnostics.getEventTotal());
            a11y.put("evtWindowState", AccessibilityDiagnostics.getEvtWindowState());
            a11y.put("evtWindowContent", AccessibilityDiagnostics.getEvtWindowContent());
            a11y.put("rootNull", AccessibilityDiagnostics.getRootNull());
            a11y.put("textEmpty", AccessibilityDiagnostics.getTextEmpty());
            a11y.put("noKeyword", AccessibilityDiagnostics.getNoKeyword());
            a11y.put("noAmount", AccessibilityDiagnostics.getNoAmount());
            a11y.put("parsed", AccessibilityDiagnostics.getParsed());
            a11y.put("dedup", AccessibilityDiagnostics.getDedup());
            a11y.put("queueInsert", AccessibilityDiagnostics.getQueueInsert());
            a11y.put("queueFail", AccessibilityDiagnostics.getQueueFail());
            a11y.put("noAdapter", AccessibilityDiagnostics.getNoAdapter());
            String lastFail = AccessibilityDiagnostics.getLastFailReason();
            if (lastFail != null) a11y.put("lastFailReason", lastFail);
            a11y.put("lastConnectedAt", AccessibilityDiagnostics.getLastConnectedAt(getContext()));
            a11y.put("lastDestroyedAt", AccessibilityDiagnostics.getLastDestroyedAt(getContext()));
            a11y.put("restartCount", AccessibilityDiagnostics.getRestartCount(getContext()));

            org.json.JSONArray a11yRing = new org.json.JSONArray();
            for (String entry : AccessibilityDiagnostics.getRing()) {
                a11yRing.put(entry);
            }
            a11y.put("ring", a11yRing);

            org.json.JSONArray a11yPkg = new org.json.JSONArray();
            for (String entry : AccessibilityDiagnostics.getPerPkg()) {
                a11yPkg.put(entry);
            }
            a11y.put("perPkg", a11yPkg);
            diag.put("accessibilityDiagnostics", a11y);

            // 通知诊断
            org.json.JSONObject notif = new org.json.JSONObject();
            notif.put("connected", NotificationDiagnostics.getConnected());
            notif.put("disconnected", NotificationDiagnostics.getDisconnected());
            notif.put("notifTotal", NotificationDiagnostics.getNotifTotal());
            notif.put("noKeyword", NotificationDiagnostics.getNoKeyword());
            notif.put("noAmount", NotificationDiagnostics.getNoAmount());
            notif.put("parsed", NotificationDiagnostics.getParsed());
            notif.put("dedup", NotificationDiagnostics.getDedup());
            notif.put("queueInsert", NotificationDiagnostics.getQueueInsert());
            notif.put("queueFail", NotificationDiagnostics.getQueueFail());
            notif.put("lastConnectedAt", NotificationDiagnostics.getLastConnectedAt(getContext()));
            notif.put("lastDisconnectedAt", NotificationDiagnostics.getLastDisconnectedAt(getContext()));

            org.json.JSONArray notifRing = new org.json.JSONArray();
            for (String entry : NotificationDiagnostics.getRing()) {
                notifRing.put(entry);
            }
            notif.put("ring", notifRing);
            diag.put("notificationDiagnostics", notif);

            // 写入文件
            File dir = new File(getContext().getExternalFilesDir(null), "diagnostics");
            if (!dir.exists()) {
                dir.mkdirs();
            }
            String fileName = "diagnostic_" +
                    formatDate("yyyyMMdd_HHmmss", new Date()) + ".json";
            File file = new File(dir, fileName);

            try (FileWriter writer = new FileWriter(file)) {
                writer.write(diag.toString(2));
                writer.flush();
            }

            ret.put("success", true);
            ret.put("filePath", file.getAbsolutePath());
            ret.put("fileName", fileName);
            ret.put("fileSize", file.length());
            ret.put("message", "诊断日志已导出");
            Log.d(TAG, "exportDiagnosticLog: 已写入 " + file.getAbsolutePath());

        } catch (IOException e) {
            Log.e(TAG, "exportDiagnosticLog: 写入文件失败", e);
            ret.put("success", false);
            ret.put("message", "写入失败: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "exportDiagnosticLog: 异常", e);
            ret.put("success", false);
            ret.put("message", "诊断导出失败: " + e.getMessage());
        }
        call.resolve(ret);
    }

    /**
     * 通过 Android 分享 Intent 分享诊断日志文件。
     */
    @PluginMethod
    public void shareDiagnosticLog(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            // 先导出日志文件
            JSObject exportCall = new JSObject();
            exportCall.put("success", false);

            // 复用 exportDiagnosticLog 逻辑（不递归调用 PluginMethod）
            org.json.JSONObject diag = new org.json.JSONObject();
            diag.put("timestamp", formatDate("yyyy-MM-dd HH:mm:ss", new Date()));
            diag.put("appVersion", getAppVersion());
            diag.put("appVersionName", getAppVersionName());
            diag.put("device", new org.json.JSONObject()
                    .put("brand", Build.BRAND)
                    .put("model", Build.MODEL)
                    .put("androidVersion", Build.VERSION.RELEASE));

            // 无障碍诊断（计数 + 环形日志）
            org.json.JSONObject a11y = new org.json.JSONObject();
            a11y.put("serviceConnected", AccessibilityDiagnostics.getServiceConnected());
            a11y.put("serviceDestroyed", AccessibilityDiagnostics.getServiceDestroyed());
            a11y.put("eventTotal", AccessibilityDiagnostics.getEventTotal());
            a11y.put("evtWindowState", AccessibilityDiagnostics.getEvtWindowState());
            a11y.put("evtWindowContent", AccessibilityDiagnostics.getEvtWindowContent());
            a11y.put("rootNull", AccessibilityDiagnostics.getRootNull());
            a11y.put("textEmpty", AccessibilityDiagnostics.getTextEmpty());
            a11y.put("noKeyword", AccessibilityDiagnostics.getNoKeyword());
            a11y.put("noAmount", AccessibilityDiagnostics.getNoAmount());
            a11y.put("parsed", AccessibilityDiagnostics.getParsed());
            a11y.put("dedup", AccessibilityDiagnostics.getDedup());
            a11y.put("queueInsert", AccessibilityDiagnostics.getQueueInsert());
            a11y.put("queueFail", AccessibilityDiagnostics.getQueueFail());
            a11y.put("noAdapter", AccessibilityDiagnostics.getNoAdapter());
            String lastFail = AccessibilityDiagnostics.getLastFailReason();
            if (lastFail != null) a11y.put("lastFailReason", lastFail);
            a11y.put("lastConnectedAt", AccessibilityDiagnostics.getLastConnectedAt(getContext()));
            a11y.put("lastDestroyedAt", AccessibilityDiagnostics.getLastDestroyedAt(getContext()));
            a11y.put("restartCount", AccessibilityDiagnostics.getRestartCount(getContext()));

            org.json.JSONArray a11yRing = new org.json.JSONArray();
            for (String entry : AccessibilityDiagnostics.getRing()) {
                a11yRing.put(entry);
            }
            a11y.put("ring", a11yRing);
            diag.put("accessibilityDiagnostics", a11y);

            // 通知诊断
            org.json.JSONObject notif = new org.json.JSONObject();
            notif.put("connected", NotificationDiagnostics.getConnected());
            notif.put("disconnected", NotificationDiagnostics.getDisconnected());
            notif.put("notifTotal", NotificationDiagnostics.getNotifTotal());
            notif.put("parsed", NotificationDiagnostics.getParsed());
            notif.put("dedup", NotificationDiagnostics.getDedup());
            notif.put("queueInsert", NotificationDiagnostics.getQueueInsert());
            org.json.JSONArray notifRing = new org.json.JSONArray();
            for (String entry : NotificationDiagnostics.getRing()) {
                notifRing.put(entry);
            }
            notif.put("ring", notifRing);
            diag.put("notificationDiagnostics", notif);

            File dir = new File(getContext().getExternalFilesDir(null), "diagnostics");
            if (!dir.exists()) {
                dir.mkdirs();
            }
            String fileName = "diagnostic_" +
                    formatDate("yyyyMMdd_HHmmss", new Date()) + ".json";
            File file = new File(dir, fileName);

            try (FileWriter writer = new FileWriter(file)) {
                writer.write(diag.toString(2));
                writer.flush();
            }

            // 创建分享 Intent
            Uri fileUri = androidx.core.content.FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("application/json");
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, "财务经理 诊断日志");
            shareIntent.putExtra(Intent.EXTRA_TEXT, "诊断日志: " + file.getName());
            shareIntent.putExtra(Intent.EXTRA_STREAM, fileUri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(Intent.createChooser(shareIntent, "分享诊断日志"));

            ret.put("success", true);
            ret.put("filePath", file.getAbsolutePath());
            ret.put("message", "已打开分享面板");

        } catch (Exception e) {
            Log.e(TAG, "shareDiagnosticLog: 失败", e);
            ret.put("success", false);
            ret.put("message", "分享失败: " + e.getMessage());
        }
        call.resolve(ret);
    }

    /** 获取 app 版本号。 */
    private int getAppVersion() {
        try {
            return getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return -1;
        }
    }

    /** 获取 app 版本名称。 */
    private String getAppVersionName() {
        try {
            return getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "unknown";
        }
    }

    /**
     * 格式化日期时间字符串。
     *
     * 注意：SimpleDateFormat 在 API 30 以下没有 (String, TimeZone) 构造器，
     * 所以手动设置时区。
     */
    private String formatDate(String pattern, Date date) {
        SimpleDateFormat sdf = new SimpleDateFormat(pattern, java.util.Locale.US);
        sdf.setTimeZone(TimeZone.getDefault());
        return sdf.format(date);
    }
}