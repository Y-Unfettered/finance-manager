package app.financemanager.capture.notification;

import java.util.HashMap;
import java.util.Map;

import app.financemanager.capture.accessibility.WhitelistPackages;

/**
 * 通知解析器注册表。
 */
public final class NotificationParserRegistry {

    private static final Map<String, NotificationParserAdapter> ADAPTERS = new HashMap<>();

    static {
        ADAPTERS.put(WhitelistPackages.ALIPAY, new AlipayNotificationAdapter());
        ADAPTERS.put(WhitelistPackages.WECHAT, new WechatNotificationAdapter());
        ADAPTERS.put(WhitelistPackages.JD, new GenericNotificationAdapter(
                WhitelistPackages.JD, WhitelistPackages.getName(WhitelistPackages.JD)));
        ADAPTERS.put(WhitelistPackages.MEITUAN, new GenericNotificationAdapter(
                WhitelistPackages.MEITUAN, WhitelistPackages.getName(WhitelistPackages.MEITUAN)));
        ADAPTERS.put(WhitelistPackages.DOUYIN, new GenericNotificationAdapter(
                WhitelistPackages.DOUYIN, WhitelistPackages.getName(WhitelistPackages.DOUYIN)));
    }

    public static NotificationParserAdapter forPackage(String packageName) {
        return ADAPTERS.get(packageName);
    }

    public static boolean hasAdapter(String packageName) {
        return ADAPTERS.containsKey(packageName);
    }
}