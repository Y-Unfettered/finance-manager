package app.financemanager.capture.accessibility;

import java.util.HashMap;
import java.util.Map;

/**
 * 支付解析器注册表。
 * 按包名路由到对应适配器。
 */
public final class PaymentParserRegistry {

    private static final Map<String, PaymentParserAdapter> ADAPTERS = new HashMap<>();

    static {
        ADAPTERS.put(WhitelistPackages.ALIPAY, new AlipayAdapter());
        ADAPTERS.put(WhitelistPackages.WECHAT, new WechatAdapter());
        ADAPTERS.put(WhitelistPackages.JD, new GenericPaymentAdapter(
                WhitelistPackages.JD, WhitelistPackages.getName(WhitelistPackages.JD)));
        ADAPTERS.put(WhitelistPackages.MEITUAN, new GenericPaymentAdapter(
                WhitelistPackages.MEITUAN, WhitelistPackages.getName(WhitelistPackages.MEITUAN)));
        ADAPTERS.put(WhitelistPackages.DOUYIN, new GenericPaymentAdapter(
                WhitelistPackages.DOUYIN, WhitelistPackages.getName(WhitelistPackages.DOUYIN)));
    }

    public static PaymentParserAdapter forPackage(String packageName) {
        return ADAPTERS.get(packageName);
    }

    public static boolean hasAdapter(String packageName) {
        return ADAPTERS.containsKey(packageName);
    }
}