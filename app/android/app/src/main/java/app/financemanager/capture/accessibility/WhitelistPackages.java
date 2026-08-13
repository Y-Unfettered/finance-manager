package app.financemanager.capture.accessibility;

/**
 * 白名单包名常量。
 *
 * AccessibilityService 和 NotificationListener 共享此列表，
 * 仅对以下 APP 的窗口变化/通知进行处理。
 */
public final class WhitelistPackages {

    private WhitelistPackages() {}

    public static final String ALIPAY = "com.eg.android.AlipayGphone";
    public static final String WECHAT = "com.tencent.mm";
    public static final String JD = "com.jingdong.app.mall";
    public static final String MEITUAN = "com.sankuai.meituan";
    public static final String DOUYIN = "com.ss.android.ugc.aweme";

    public static final String[] ALL = {
            ALIPAY,
            WECHAT,
            JD,
            MEITUAN,
            DOUYIN,
    };

    public static final String[] NAMES = {
            "支付宝",
            "微信",
            "京东",
            "美团",
            "抖音",
    };

    /** 检查包名是否在白名单中。 */
    public static boolean contains(String packageName) {
        if (packageName == null) return false;
        for (String p : ALL) {
            if (p.equals(packageName)) return true;
        }
        return false;
    }

    /** 包名到展示名的映射。 */
    public static String getName(String packageName) {
        for (int i = 0; i < ALL.length; i++) {
            if (ALL[i].equals(packageName)) return NAMES[i];
        }
        return packageName;
    }
}