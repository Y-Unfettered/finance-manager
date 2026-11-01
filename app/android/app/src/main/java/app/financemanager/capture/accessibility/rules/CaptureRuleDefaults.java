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

    /** 当前内置规则集版本（4 = 成功页默认禁用，捕获只走账单详情页）。 */
    public static final int CURRENT_VERSION = 5;

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
        config.put("version", CURRENT_VERSION);
        config.put("rules", new JSONArray()
                .put(alipayBillDetailRule()).put(wechatBillDetailRule()).put(wechatRedPacketRule())
                .put(wechatLingqiantongOutRule()).put(wechatWithdrawRule()).put(wechatTransferInRule())
                .put(alipayRule()).put(wechatRule())
                .put(jdRule()).put(meituanRule()).put(douyinRule()));
        JSONObject prefs = new JSONObject();
        prefs.put("quickEntryEnabled", true);
        prefs.put("autoRecoverEnabled", true);
        config.put("preferences", prefs);
        return config;
    }

    /** 支付宝·账单详情（pageType=bill-detail，P1）。priority 200 高于成功页 100，优先命中。 */
    private static JSONObject alipayBillDetailRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "alipay-bill-detail");
        rule.put("name", "支付宝·账单详情");
        rule.put("packageName", "com.eg.android.AlipayGphone");
        rule.put("channel", "accessibility");
        rule.put("pageType", "bill-detail");

        JSONObject sig = new JSONObject();
        // 实测（2026-10-31）：标题栏"账单详情"渲染有竞态（WebView 渐进加载，5 次重试都可能没有），
        // 不能作为硬性要求；"创建时间"是强特征（列表/消息页没有）。
        // 标题与状态词、业务字段全部并入 requireAnyOf（任一命中即可）。
        sig.put("requireAll", new JSONArray());
        // 时间标签措辞并存（消费/缴费页"创建时间"、自动扣款页"支付时间"），任一命中
        sig.put("requiredAnyLabel", new JSONArray().put("创建时间").put("支付时间").put("收款时间"));
        sig.put("requireAnyOf", new JSONArray()
                .put("账单详情")
                .put("交易成功").put("转账成功").put("收款成功").put("付款成功").put("自动扣款成功")
                .put("付款方式").put("转账备注").put("对方账户")
                .put("提现到").put("收款方式").put("处理进度"));
        // 成功页兜底不得抢详情页的活：页面含详情结构词时成功页规则直接拒绝
        rule.put("excludeKeywords", new JSONArray()
                .put("账单详情").put("创建时间").put("转账备注"));
        rule.put("pageSignature", sig);

        JSONObject aliases = new JSONObject();
        aliases.put("amountLabel", new JSONArray().put("实付金额").put("实收金额").put("金额"));
        aliases.put("orderAmountLabel", new JSONArray().put("订单金额"));
        aliases.put("discountLabel", new JSONArray().put("红包").put("优惠").put("满减").put("立减"));
        aliases.put("occurredAtLabel", new JSONArray().put("创建时间").put("支付时间").put("交易时间").put("转账时间"));
        aliases.put("accountLabel", new JSONArray().put("付款方式").put("支付方式").put("收款方式"));
        aliases.put("merchantLabel", new JSONArray().put("对方账户").put("收款方").put("商户").put("商家"));
        aliases.put("noteLabel", new JSONArray().put("缴费说明").put("交易详情").put("理由").put("转账备注").put("商品"));
        aliases.put("orderIdLabel", new JSONArray().put("订单号").put("商户单号").put("交易单号").put("户号"));
        rule.put("fieldAliases", aliases);

        // 布局锚点：模板结构提取——商户名固定在金额行上方（无标签前缀），
        // 换公司/换金额都不变，比标签匹配覆盖面更广（保险等缴费页无"对方账户"标签）
        JSONObject layoutExtract = new JSONObject();
        JSONObject merchantAnchor = new JSONObject();
        merchantAnchor.put("anchor", "amount");
        merchantAnchor.put("offset", -1);
        layoutExtract.put("merchant", merchantAnchor);
        rule.put("layoutExtract", layoutExtract);

        JSONObject noteRule = new JSONObject();
        noteRule.put("preferFields", new JSONArray().put("缴费说明").put("交易详情").put("转账备注").put("商品").put("理由"));
        noteRule.put("maxLength", 50);
        noteRule.put("cleanPatterns", new JSONArray().put("[-–]\\*+[^-–]*$"));
        noteRule.put("fallbackToMerchant", true);
        rule.put("noteRule", noteRule);

        JSONObject dir = new JSONObject();
        dir.put("negative", "expense");
        // 外部打款信号：对方账户（外部实体）、转账备注（外部转账/收款特有，自账户划转页没有）
        dir.put("externalIncomeFields", new JSONArray().put("对方账户").put("转账备注"));
        dir.put("selfTransferFields", new JSONArray().put("提现到").put("收款方式").put("处理进度"));
        dir.put("refundFields", new JSONArray().put("退款"));
        dir.put("default", "confirm");
        rule.put("directionRule", dir);

        rule.put("categoryMappings", new JSONArray()
                .put(categoryMapping("(燃气|水费|电费|话费|宽带|物业)", "utilities", "expense"))
                .put(categoryMapping("(保险|保费|好医保)", "insurance", "expense"))
                .put(categoryMapping("(外卖|餐饮|奶茶|咖啡|麻辣烫)", "food", "expense"))
                .put(categoryMapping("(超市|便利店|盒马)", "grocery", "expense"))
                .put(categoryMapping("(零食|小吃|坚果|卤味|牛蹄筋|牛肉干)", "food", "expense"))
                .put(categoryMapping("(提现|返现|退款|红包|签到|奖励|返款)", "income-other", "income")));
        rule.put("enabled", true);
        rule.put("priority", 200);
        return rule;
    }

    /** 微信·账单详情（pageType=bill-detail，P1）。签名不含"账单详情"标题（实测微信无此标题）。 */
    private static JSONObject wechatBillDetailRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "wechat-bill-detail");
        rule.put("name", "微信·账单详情");
        rule.put("packageName", "com.tencent.mm");
        rule.put("channel", "accessibility");
        rule.put("pageType", "bill-detail");

        JSONObject sig = new JSONObject();
        // 模板 1（扫码付款给个人，实测 2026-10-31）：单号叫"转账单号"、备注叫"收款方备注"，
        // 时间叫"转账时间"——同义组任一命中，不再写死单一措辞
        sig.put("requireAll", new JSONArray().put("支付成功"));
        sig.put("requiredLabels", new JSONArray().put("支付方式"));
        sig.put("requiredAnyLabel", new JSONArray()
                .put("支付时间").put("转账时间").put("收款时间")
                .put("交易单号").put("转账单号").put("商户单号"));
        rule.put("pageSignature", sig);

        // 布局锚点：微信标题"扫二维码付款-给XXX"固定在金额上方，清洗前缀得商户名
        JSONObject layoutExtract = new JSONObject();
        JSONObject merchantAnchor = new JSONObject();
        merchantAnchor.put("anchor", "amount");
        merchantAnchor.put("offset", -1);
        merchantAnchor.put("stripPrefix", "扫二维码付款-给");
        layoutExtract.put("merchant", merchantAnchor);
        rule.put("layoutExtract", layoutExtract);

        JSONObject aliases = new JSONObject();
        aliases.put("amountLabel", new JSONArray().put("实付金额").put("金额"));
        aliases.put("orderAmountLabel", new JSONArray().put("原价").put("订单金额"));
        aliases.put("originalPriceLabel", new JSONArray().put("原价"));
        aliases.put("discountLabel", new JSONArray().put("优惠").put("红包").put("立减").put("满减"));
        aliases.put("occurredAtLabel", new JSONArray().put("支付时间").put("转账时间").put("收款时间"));
        aliases.put("accountLabel", new JSONArray().put("支付方式"));
        aliases.put("merchantLabel", new JSONArray().put("商户全称").put("商户"));
        aliases.put("noteLabel", new JSONArray().put("商品").put("收款方备注").put("商户全称"));
        aliases.put("orderIdLabel", new JSONArray().put("交易单号").put("商户单号").put("转账单号"));
        rule.put("fieldAliases", aliases);

        JSONObject noteRule = new JSONObject();
        noteRule.put("preferFields", new JSONArray().put("商品").put("收款方备注").put("商户全称"));
        noteRule.put("maxLength", 50);
        noteRule.put("cleanPatterns", new JSONArray()
                .put("订单编号\\d+$").put("App-\\d+$")
                .put("[-–]\\d{6,}$").put("-\\d{4,}$"));
        noteRule.put("fallbackToMerchant", true);
        rule.put("noteRule", noteRule);

        JSONObject dir = new JSONObject();
        dir.put("negative", "expense");
        dir.put("externalIncomeField", "");
        dir.put("selfTransferFields", new JSONArray());
        dir.put("refundFields", new JSONArray().put("退款"));
        dir.put("default", "confirm");
        rule.put("directionRule", dir);

        rule.put("categoryMappings", new JSONArray()
                .put(categoryMapping("(外卖|牛杂|麻辣烫|奶茶|咖啡|餐饮|餐厅)", "food", "expense"))
                .put(categoryMapping("(考试|驾考|车管|财政|非税|罚款)", "other-expense", "expense"))
                .put(categoryMapping("(超市|生鲜|水果|零食)", "grocery", "expense"))
                .put(categoryMapping("(橙子|苹果|香蕉|梨|桃|葡萄|西瓜|芒果|草莓|车厘子|荔枝|龙眼|猕猴桃|火龙果|柚子|柠檬|樱桃|哈密瓜|零食|小吃|坚果|水果)", "food", "expense"))
                .put(categoryMapping("(京东|数码|手机|家电)", "shopping", "expense"))
                .put(categoryMapping("(二维码收款|扫码付款|扫码)", "other-expense", "expense")));
        rule.put("enabled", true);
        rule.put("priority", 200);
        return rule;
    }

    /**
     * 模板 B：零钱通转出-到零钱（transfer，实测 2026-10-31）。
     * 标题即双账户："零钱通转出-到零钱"——转出=零钱通、转入=零钱（默认微信大号）。
     */
    private static JSONObject wechatLingqiantongOutRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "wechat-lingqiantong-out");
        rule.put("name", "微信·零钱通转出");
        rule.put("packageName", "com.tencent.mm");
        rule.put("channel", "accessibility");
        rule.put("pageType", "bill-detail");

        JSONObject sig = new JSONObject();
        sig.put("requireAll", new JSONArray().put("零钱通转出"));
        sig.put("requiredAnyLabel", new JSONArray().put("收款方账号").put("发起时间"));
        rule.put("pageSignature", sig);

        JSONObject te = new JSONObject();
        te.put("titleSeparator", "转出-到");
        // 转入方固定语义"零钱"→大号零钱（规则可调：改账户名时改这里）
        te.put("defaultTargetAccountHint", "微信（大号）");
        rule.put("transferExtract", te);

        JSONObject aliases = new JSONObject();
        aliases.put("amountLabel", new JSONArray().put("金额"));
        aliases.put("occurredAtLabel", new JSONArray().put("发起时间"));
        aliases.put("targetAccountLabel", new JSONArray().put("收款方账号"));
        aliases.put("orderIdLabel", new JSONArray().put("交易单号"));
        rule.put("fieldAliases", aliases);

        JSONObject dir = new JSONObject();
        dir.put("negative", "expense");
        dir.put("selfTransferFields", new JSONArray().put("收款方账号"));
        dir.put("default", "transfer");
        rule.put("directionRule", dir);

        rule.put("enabled", true);
        rule.put("priority", 205);
        return rule;
    }

    /**
     * 模板 C：零钱提现-到银行卡（transfer，实测 2026-10-31）。
     * 标题"零钱提现-到成都银行(0652)"——转出=零钱（默认微信大号）、转入=提现银行字段值。
     * 服务费：实到 = 提现金额 - 服务费（feeLabel 结构化提取）。
     */
    private static JSONObject wechatWithdrawRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "wechat-withdraw");
        rule.put("name", "微信·零钱提现");
        rule.put("packageName", "com.tencent.mm");
        rule.put("channel", "accessibility");
        rule.put("pageType", "bill-detail");

        JSONObject sig = new JSONObject();
        sig.put("requireAll", new JSONArray().put("零钱提现"));
        sig.put("requiredLabels", new JSONArray().put("提现金额").put("服务费"));
        rule.put("pageSignature", sig);

        JSONObject te = new JSONObject();
        te.put("titleSeparator", "提现-到");
        te.put("defaultSourceAccountHint", "微信（大号）");
        rule.put("transferExtract", te);

        JSONObject aliases = new JSONObject();
        aliases.put("amountLabel", new JSONArray().put("提现金额").put("金额"));
        aliases.put("occurredAtLabel", new JSONArray().put("到账时间").put("申请时间"));
        aliases.put("targetAccountLabel", new JSONArray().put("提现银行"));
        aliases.put("feeLabel", new JSONArray().put("服务费"));
        aliases.put("orderIdLabel", new JSONArray().put("提现单号"));
        rule.put("fieldAliases", aliases);

        JSONObject dir = new JSONObject();
        dir.put("negative", "expense");
        dir.put("selfTransferFields", new JSONArray().put("提现银行").put("收款方账号"));
        dir.put("default", "transfer");
        rule.put("directionRule", dir);

        rule.put("enabled", true);
        rule.put("priority", 205);
        return rule;
    }

    /**
     * 模板 D/E：微信转账收入（商家转账/个人转账，实测 2026-10-31）。
     * 标题"商家转账-来自美团"/"转账-来自东哥锅盔"——布局锚点剥正则前缀得来源名；
     * 收款固定零钱（默认微信大号）；方向 income。
     */
    private static JSONObject wechatTransferInRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "wechat-transfer-in");
        rule.put("name", "微信·转账收入");
        rule.put("packageName", "com.tencent.mm");
        rule.put("channel", "accessibility");
        rule.put("pageType", "bill-detail");

        JSONObject sig = new JSONObject();
        sig.put("requireAll", new JSONArray().put("-来自"));
        sig.put("requiredAnyLabel", new JSONArray()
                .put("付款商家").put("转账说明").put("当前状态").put("收款时间"));
        rule.put("pageSignature", sig);

        // 商户：优先"付款商家"标签（模板 D 有），无标签时布局锚点剥正则前缀（模板 E/标题）
        JSONObject layoutExtract = new JSONObject();
        JSONObject merchantAnchor = new JSONObject();
        merchantAnchor.put("anchor", "amount");
        merchantAnchor.put("offset", -1);
        merchantAnchor.put("stripPrefixPattern", "^(商家转账|转账)-来自");
        layoutExtract.put("merchant", merchantAnchor);
        rule.put("layoutExtract", layoutExtract);

        rule.put("defaultSourceAccountHint", "微信（大号）");

        JSONObject aliases = new JSONObject();
        aliases.put("amountLabel", new JSONArray().put("金额"));
        aliases.put("occurredAtLabel", new JSONArray().put("转账时间").put("收款时间"));
        aliases.put("merchantLabel", new JSONArray().put("付款商家"));
        aliases.put("noteLabel", new JSONArray().put("付款备注").put("转账说明"));
        aliases.put("orderIdLabel", new JSONArray().put("付款单号").put("转账单号"));
        rule.put("fieldAliases", aliases);

        JSONObject dir = new JSONObject();
        dir.put("negative", "expense");
        dir.put("default", "income");
        rule.put("directionRule", dir);

        rule.put("categoryMappings", new JSONArray()
                .put(categoryMapping("(现金红包|红包|返现|奖励|签到|开盲盒)", "income-other", "income")));
        rule.put("defaultCategoryId", "income-other");

        rule.put("enabled", true);
        rule.put("priority", 205);
        return rule;
    }

    private static JSONObject categoryMapping(String namePattern, String categoryId, String kind)
            throws org.json.JSONException {
        JSONObject m = new JSONObject();
        m.put("namePattern", namePattern);
        m.put("categoryId", categoryId);
        m.put("kind", kind);
        return m;
    }

    /**
     * 微信·红包收款页（pageType=bill-detail 子类型，PRD §6.1/验收 9）。
     * 标题含"微信红包-来自" + 收款时间 + 已存入零钱 → 收入（正金额弹确认，用户确认方向）。
     */
    private static JSONObject wechatRedPacketRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "wechat-redpacket");
        rule.put("name", "微信·红包收款");
        rule.put("packageName", "com.tencent.mm");
        rule.put("channel", "accessibility");
        rule.put("pageType", "bill-detail");

        JSONObject sig = new JSONObject();
        sig.put("requireAll", new JSONArray().put("微信红包-来自"));
        sig.put("requireAnyOf", new JSONArray().put("已存入零钱").put("已领取").put("已存入"));
        rule.put("pageSignature", sig);

        // 布局锚点：标题"微信红包-来自XXX"固定在金额上方，剥前缀得发送人
        JSONObject layoutExtract = new JSONObject();
        JSONObject merchantAnchor = new JSONObject();
        merchantAnchor.put("anchor", "amount");
        merchantAnchor.put("offset", -1);
        merchantAnchor.put("stripPrefix", "微信红包-来自");
        layoutExtract.put("merchant", merchantAnchor);
        rule.put("layoutExtract", layoutExtract);

        // 红包固定入零钱（默认微信大号；用小号时用户手动切）
        rule.put("defaultSourceAccountHint", "微信（大号）");
        rule.put("defaultCategoryId", "income-other");

        JSONObject aliases = new JSONObject();
        aliases.put("amountLabel", new JSONArray().put("金额"));
        aliases.put("occurredAtLabel", new JSONArray().put("收款时间"));
        aliases.put("noteLabel", new JSONArray().put("红包详情").put("红包文字").put("留言"));
        aliases.put("orderIdLabel", new JSONArray().put("交易单号").put("商户单号"));
        rule.put("fieldAliases", aliases);

        JSONObject noteRule = new JSONObject();
        noteRule.put("preferFields", new JSONArray().put("红包文字").put("留言"));
        noteRule.put("maxLength", 50);
        noteRule.put("fallbackToMerchant", true);
        rule.put("noteRule", noteRule);

        JSONObject dir = new JSONObject();
        dir.put("negative", "expense");
        dir.put("externalIncomeField", "");
        dir.put("selfTransferFields", new JSONArray());
        dir.put("refundFields", new JSONArray().put("退款"));
        dir.put("default", "income");
        rule.put("directionRule", dir);

        rule.put("categoryMappings", new JSONArray()
                .put(categoryMapping("(红包|收款)", "income-other", "income")));
        rule.put("enabled", true);
        rule.put("priority", 210);
        return rule;
    }

    private static JSONObject alipayRule() throws org.json.JSONException {
        JSONObject rule = new JSONObject();
        rule.put("id", "alipay-default");
        rule.put("name", "支付宝");
        rule.put("packageName", "com.eg.android.AlipayGphone");
        rule.put("channel", "accessibility");
        rule.put("successKeywords", new JSONArray()
                .put("支付成功").put("付款成功").put("转账成功").put("交易成功"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0))
                .put(pattern("[+\\-]\\s*(\\d+[\\.\\d]*)", 1)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商家|商户|收款方(?!式)|对方账户|店铺|收款人|转入)[:：]?\\s*([^\\n\\r]+)", 1)));
        rule.put("accountPatterns", new JSONArray()
                .put(pattern("(?:支付账户|账户|付款方式|银行卡|储蓄卡|余额宝|余额)[:：]\\s*(.+)", 1)));
        // 页面含账单详情结构词时（详情页标题渲染竞态兜底），成功页规则拒绝，让位详情解析
        rule.put("excludeKeywords", new JSONArray()
                .put("账单详情").put("创建时间").put("转账备注"));
        // P1：成功页是广告模板页、字段不全（PRD §1.2），且与详情页/列表页存在误抓竞态，
        // 默认禁用——捕获只走账单详情页（详情页才是可靠来源）。需要时可在规则配置中开启。
        rule.put("enabled", false);
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
                .put("支付成功").put("付款成功").put("交易成功"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商户|商家|收款方)[:：]\\s*(.+)", 1)));
        rule.put("accountPatterns", new JSONArray());
        // P1：成功页是广告模板页、字段不全（PRD §1.2），且与详情页/列表页存在误抓竞态，
        // 默认禁用——捕获只走账单详情页（详情页才是可靠来源）。需要时可在规则配置中开启。
        rule.put("enabled", false);
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
                .put("支付成功").put("付款成功").put("转账成功"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商家|商户|收款方)[:：]\\s*(.+)", 1)));
        rule.put("accountPatterns", new JSONArray());
        // P1：成功页是广告模板页、字段不全（PRD §1.2），且与详情页/列表页存在误抓竞态，
        // 默认禁用——捕获只走账单详情页。需要时可在规则配置中开启。
        rule.put("enabled", false);
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
                .put("支付成功").put("付款成功").put("转账成功"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商家|商户|收款方)[:：]\\s*(.+)", 1)));
        rule.put("accountPatterns", new JSONArray());
        // P1：成功页是广告模板页、字段不全（PRD §1.2），且与详情页/列表页存在误抓竞态，
        // 默认禁用——捕获只走账单详情页。需要时可在规则配置中开启。
        rule.put("enabled", false);
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
                .put("支付成功").put("付款成功").put("转账成功"));
        rule.put("amountPatterns", new JSONArray()
                .put(pattern("[¥￥]\\s*(\\d+[\\.\\d]*)", 1))
                .put(pattern("\\d+[\\.\\d]*\\s*元", 0)));
        rule.put("merchantPatterns", new JSONArray()
                .put(pattern("(?:商家|商户|收款方)[:：]\\s*(.+)", 1)));
        rule.put("accountPatterns", new JSONArray());
        // P1：成功页是广告模板页、字段不全（PRD §1.2），且与详情页/列表页存在误抓竞态，
        // 默认禁用——捕获只走账单详情页。需要时可在规则配置中开启。
        rule.put("enabled", false);
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