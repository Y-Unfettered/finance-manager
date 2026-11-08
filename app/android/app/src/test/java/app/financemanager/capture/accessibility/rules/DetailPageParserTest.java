package app.financemanager.capture.accessibility.rules;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.util.Map;

/**
 * DetailPageParser 纯逻辑 JVM 单测。
 *
 * 覆盖 PRD §13 验收（P1）：
 * - 验收 1：实付金额取实付标签（-28.00 ≠ 订单金额 30.00）
 * - 验收 3/4/5：方向按字段结构判断（对方账户→income；提现到/收款方式/处理进度→transfer）
 * - 验收 6：微信备注清洗订单号尾缀
 * - 验收 8：微信纯订单号商品降级到商户全称
 * - 验收 10：时间双格式（支付宝 ISO / 微信中文）
 * - 验收 11：无符号金额按字段结构判定，不误判为支出
 */
public class DetailPageParserTest {

    private static final DetailPageParser PARSER = new DetailPageParser();

    // ---------- 验收 10：时间双格式 ----------

    @Test
    public void normalizeTime_alipayIso() {
        assertEquals("2026-10-31T11:03:34", DetailPageParser.normalizeTime("2026-10-31 11:03:34"));
    }

    @Test
    public void normalizeTime_wechatChinese() {
        assertEquals("2026-10-29T13:24:44", DetailPageParser.normalizeTime("2026年10月29日 13:24:44"));
    }

    @Test
    public void normalizeTime_invalidReturnsNull() {
        assertNull(DetailPageParser.normalizeTime(""));
        assertNull(DetailPageParser.normalizeTime("燃气费"));
    }

    // ---------- 验收 1：实付金额（图3 燃气费） ----------

    /** 支付宝燃气费：订单金额 30.00、实付 -28.00 → 取 2800 且负号（记 28 不是 30）。 */
    @Test
    public void paidAmount_prefersAmountLabel_overOrderAmount() throws Exception {
        String text = "账单详情\n交易成功\n订单金额\n30.00\n红包\n-2.00\n实付金额\n-28.00\n"
                + "创建时间\n2026-10-31 11:03:34\n付款方式\n余额\n缴费说明\n燃气费-*贤萍";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(2800L, r.minor);
        assertTrue(r.negative);
    }

    /** 无实付标签时，负数金额优先于更大绝对值的正数。 */
    @Test
    public void paidAmount_negativeWins_whenNoLabel() throws Exception {
        String text = "账单详情\n交易成功\n订单金额\n30.00\n-28.00\n创建时间\n2026-10-31 11:03:34";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(2800L, r.minor);
        assertTrue(r.negative);
    }

    /** 验收 11：图二 300.00 无正负号 → 取最大正数，不预设为支出。 */
    @Test
    public void paidAmount_unsignedAmount_isPositive() throws Exception {
        String text = "账单详情\n交易成功\n提现到\n中信银行(5441)\n300.00\n"
                + "创建时间\n2026-10-31 09:12:00\n处理进度\n已到账";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(30000L, r.minor);
        assertFalse(r.negative);
    }

    // ---------- 验收 3/4/5/11：方向按字段结构判断 ----------

    /** 图一：含"对方账户"（外部实体打款）→ income。 */
    @Test
    public void direction_externalIncomeField() throws Exception {
        String text = "转账金额\n28.00\n对方账户\n外卖名堂\n转账备注\n支付宝余额提现\n理由\n提现";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        assertEquals("income", PARSER.decideDirection(text, fields, false, rule, null));
    }

    /** 图二：含"提现到"/"处理进度"且无"对方账户" → transfer（300.00 无符号不误判支出）。 */
    @Test
    public void direction_selfTransferFields() throws Exception {
        String text = "账单详情\n交易成功\n提现到\n中信银行(5441)\n300.00\n处理进度\n已到账";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        assertEquals("transfer", PARSER.decideDirection(text, fields, false, rule, null));
    }

    /** 图三：含"收款方式"且无"对方账户" → transfer。 */
    @Test
    public void direction_selfTransferByCollectMethod() throws Exception {
        String text = "账单详情\n交易成功\n收款方式\n支付宝小荷包\n925.60\n处理进度\n已转出";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        assertEquals("transfer", PARSER.decideDirection(text, fields, false, rule, null));
    }

    /** 负金额 → expense（自动）。 */
    @Test
    public void direction_negativeAmountIsExpense() throws Exception {
        String text = "账单详情\n交易成功\n实付金额\n-28.00";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        assertEquals("expense", PARSER.decideDirection(text, fields, true, rule, null));
    }

    /** 实测场景（2026-10-31 真机）：淘宝评价奖励 +1.00（转账成功+收款方式+转账备注，无对方账户）→ income。 */
    @Test
    public void direction_cashbackWithTransferRemarkIsIncome() throws Exception {
        String text = "账单详情\n天*****店\n+1.00\n转账成功\n创建时间\n2026-10-31 15:47:08\n"
                + "收款方式\n账户余额\n转账备注\n淘宝评价奖励";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        assertEquals("income", PARSER.decideDirection(text, fields, false, rule, null));
        assertEquals("淘宝评价奖励", PARSER.extractNote(fields, rule, null));
    }

    /** 实测竞态：详情页标题"账单详情"未渲染（只有内容区）→ "创建时间"强特征兜住，签名仍通过。 */
    @Test
    public void pageSignature_detailPageWithoutTitle() throws Exception {
        String text = "杭州南锦电子商务有限公司\n+20.00\n交易成功\n创建时间\n2026-10-31 15:47:34\n"
                + "转账备注\n淘宝签到提现\n对方账户\n杭州南锦电子商务有限公司";
        assertNull(PARSER.checkPageSignature(text, alipayRule()));
    }

    /** 收款/转账类详情页状态词是"转账成功"（非"交易成功"）→ requireAnyOf 兜住，签名通过。 */
    @Test
    public void pageSignature_transferSuccessPageMatches() throws Exception {
        String text = "账单详情\n+1.00\n转账成功\n创建时间\n2026-10-31 15:47:08\n收款方式\n账户余额";
        assertNull(PARSER.checkPageSignature(text, alipayRule()));
    }

    /** 字段结构无法判断 → confirm（弹确认）。 */
    @Test
    public void direction_unknownDefaultsToConfirm() throws Exception {
        String text = "账单详情\n交易成功\n500.00\n创建时间\n2026-10-31 09:00:00";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        assertEquals("confirm", PARSER.decideDirection(text, fields, false, rule, null));
    }

    // ---------- 验收 6/8：备注清洗与降级（微信） ----------

    /** 验收 6：商品"三板斧牛杂面（温江店）-美团外卖App-261026112345" → 清洗订单号尾缀。 */
    @Test
    public void note_wechatMeituanCleansOrderSuffix() throws Exception {
        JSONObject rule = wechatRule();
        Map<String, String> fields = PARSER.extractFields(
                "支付成功\n支付时间\n2026年10月29日 13:24:44\n商品\n三板斧牛杂面（温江店）-美团外卖App-26102611234567\n"
                        + "支付方式\n成都银行储蓄卡(0652)\n交易单号\n4200002026102912345678",
                rule);

        String note = PARSER.extractNote(fields, rule, "美团");
        assertEquals("三板斧牛杂面（温江店）-美团外卖", note);
    }

    /** 验收 8：商品为纯订单号（京东微信单）→ 无意义降级到商户全称。 */
    @Test
    public void note_wechatJdOrderNumberFallsBackToMerchant() throws Exception {
        JSONObject rule = wechatRule();
        Map<String, String> fields = PARSER.extractFields(
                "支付成功\n支付时间\n2026年10月30日 20:11:00\n商品\n京东-订单编号3667279014011752\n"
                        + "支付方式\n零钱\n交易单号\n4200002026103098765432\n商户全称\n江苏京东信息技术有限公司",
                rule);

        String note = PARSER.extractNote(fields, rule, "江苏京东信息技术有限公司");
        assertEquals("江苏京东信息技术有限公司", note);
    }

    /** 支付宝脱敏星号尾缀：燃气费-*贤萍 → 燃气费。 */
    @Test
    public void note_alipayCleansMaskedSuffix() throws Exception {
        String cleaned = DetailPageParser.cleanNote(
                "燃气费-*贤萍", new String[]{"[-–]\\*+[^-–]*$"});
        assertEquals("燃气费", cleaned);
    }

    /** 实测场景（2026-10-31 真机）：淘宝签到提现 +20.00 → 备注取"转账备注"字段值。 */
    @Test
    public void note_alipayUsesTransferRemarkField() throws Exception {
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(
                "+20.00\n交易成功\n创建时间\n2026-10-31 15:47:34\n转账备注\n淘宝签到提现\n"
                        + "对方账户\n杭州南锦电子商务有限公司",
                rule);

        assertEquals("淘宝签到提现", PARSER.extractNote(fields, rule, "杭州南锦电子商务有限公司"));
    }

    /** 实测场景：提现打款（含"对方账户"+"转账备注"）→ income 分类映射命中（提现/签到）。 */
    @Test
    public void category_incomeFromWithdrawRemark() throws Exception {
        JSONObject rule = alipayRule();
        assertEquals("income:income-other", PARSER.suggestCategory("淘宝签到提现", "杭州南锦电子商务有限公司", rule));
    }

    /** 备注缺失时返回 null（降级记录：金额入账、备注空，照常弹窗）。 */
    @Test
    public void note_missingFieldsWithoutFallbackReturnsNull() throws Exception {
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(
                "账单详情\n交易成功\n实付金额\n-28.00\n创建时间\n2026-10-31 11:03:34\n付款方式\n余额",
                rule);

        assertNull(PARSER.extractNote(fields, rule, null));
    }

    /** 实测场景：交易详情的值被"更多"按钮文本抢占 → 跳过 UI 噪声取真实内容。 */
    @Test
    public void note_uiNoiseValueSkipped() throws Exception {
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(
                "账单详情\n交易成功\n付款方式\n花呗\n交易详情\n更多\n2026.10月保费缴清-好医保·长期医疗\n"
                        + "创建时间\n2026-10-31 10:56:52",
                rule);

        assertEquals("2026.10月保费缴清-好医保·长期医疗", fields.get("交易详情"));
        assertEquals("2026.10月保费缴清-好医保·长期医疗", PARSER.extractNote(fields, rule, null));
    }

    /** 实测场景：底部功能区词"账单管理"排在交易详情后 → 跳过取真实保费内容。 */
    @Test
    public void note_bottomFunctionAreaWordsSkipped() throws Exception {
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(
                "交易成功\n付款方式\n花呗\n交易详情\n账单管理\n2026.10月保费缴清-好医保·长期医疗(旗舰版)\n"
                        + "创建时间\n2026-10-31 10:56:52\n账单管理\n我的消费图鉴",
                rule);

        assertEquals("2026.10月保费缴清-好医保·长期医疗(旗舰版)", fields.get("交易详情"));
        assertEquals("2026.10月保费缴清-好医保·长期医疗(旗舰版)", PARSER.extractNote(fields, rule, null));
        // 真实备注含短词不误杀
        org.junit.Assert.assertFalse(DetailPageParser.isUiNoise("给家里交备注费用"));
    }

    /** 实测场景：燃气费 订单30 红包2 实付28 → 提取优惠差额。 */
    @Test
    public void discount_extractedFromOrderAmount() throws Exception {
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(
                "账单详情\n交易成功\n订单金额\n30.00\n红包\n-2.00\n实付金额\n-28.00\n"
                        + "创建时间\n2026-10-31 11:03:34\n付款方式\n余额\n缴费说明\n燃气费",
                rule);

        long[] discount = PARSER.extractDiscount(fields, rule, 2800L);
        org.junit.Assert.assertNotNull(discount);
        assertEquals(3000L, discount[0]);
        assertEquals(200L, discount[1]);
        assertEquals("30.00", DetailPageParser.formatYuan(3000L));
        assertEquals("28.50", DetailPageParser.formatYuan(2850L));
    }

    /** 实测场景（2026-10-31 真机）：他人转账 +24.22，页面上另有余额大数字 → 带符号金额绝对优先。 */
    @Test
    public void paidAmount_signedBeatsBareBalance() throws Exception {
        String text = "账单详情\n上海中燕信息科技有限公司\n+24.22\n转账成功\n"
                + "创建时间\n2026-10-31 18:05:00\n账户余额\n33785925.00\n转账备注\n33785925|兑现";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(2422L, r.minor);
        assertFalse(r.negative);
    }

    /** 实测场景：商家转账备注"33785925|兑现"剔除数字后实义汉字不足 3 → 降级到商户全称。 */
    @Test
    public void note_merchantNumberRemarkDegradesToMerchant() throws Exception {
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(
                "账单详情\n转账成功\n转账备注\n33785925|兑现\n对方账户\n上海中燕信息科技有限公司",
                rule);

        assertEquals("上海中燕信息科技有限公司", PARSER.extractNote(fields, rule, "上海中燕信息科技有限公司"));
        org.junit.Assert.assertFalse(DetailPageParser.isMeaningful("33785925|兑现"));
        org.junit.Assert.assertTrue(DetailPageParser.isMeaningful("2026.10月保费缴清-好医保·长期医疗"));
    }

    /** 实测场景（2026-10-31 真机）：自动扣款页（支付时间/商品说明/自动扣款成功）→ 完整解析。 */
    @Test
    public void autoDeductVariantPage_parsesFully() throws Exception {
        String text = "远寻**司\n-27.70\n自动扣款成功\n支付时间\n2026-10-28 18:11:14\n"
                + "付款方式\n花呗\n商品说明\n内蒙古牛肉筋风干孜然零食小吃\n账单详情";
        JSONObject rule = alipayRule();

        assertNull(PARSER.checkPageSignature(text, rule));
        Map<String, String> fields = PARSER.extractFields(text, rule);
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(2770L, r.minor);
        assertTrue(r.negative);
        assertEquals("2026-10-28T18:11:14", DetailPageParser.normalizeTime("2026-10-28 18:11:14"));
        assertEquals("内蒙古牛肉筋风干孜然零食小吃", PARSER.extractNote(fields, rule, null));
        assertEquals("远寻**司", PARSER.extractMerchant(text, fields, rule));
        assertEquals("expense:food", PARSER.suggestCategory(
                PARSER.extractNote(fields, rule, null), PARSER.extractMerchant(text, fields, rule), rule));
        assertEquals("expense", PARSER.decideDirection(text, fields, r.negative, rule, null));
    }

    /** 布局锚点：保险页商户名在金额上方（无标签）→ 结构位置提取（换公司/金额不变）。 */
    @Test
    public void merchant_layoutAnchorAboveAmount() throws Exception {
        JSONObject rule = alipayRule();
        String text1 = "中国人寿保险股份有限公司\n155.19\n交易成功\n创建时间\n2026-10-31 10:56:52\n付款方式\n花呗";
        Map<String, String> fields = PARSER.extractFields(text1, rule);

        assertEquals("中国人寿保险股份有限公司", PARSER.extractMerchant(text1, fields, rule));
        // 换一家公司、换金额——同一模板同样命中
        String text2 = "平安健康保险股份有限公司\n31.55\n交易成功\n创建时间\n2026-10-31 11:00:00\n付款方式\n花呗";
        Map<String, String> fields2 = PARSER.extractFields(text2, rule);
        assertEquals("平安健康保险股份有限公司", PARSER.extractMerchant(text2, fields2, rule));
    }

    /** 布局锚点与标签一致时（转账页）互为印证；金额上一行是 UI 词则放弃锚点。 */
    @Test
    public void merchant_layoutAnchorSkipsUiNoise() throws Exception {
        JSONObject rule = alipayRule();
        String text = "账单管理\n+20.00\n交易成功\n创建时间\n2026-10-31 15:47:34";
        Map<String, String> fields = PARSER.extractFields(text, rule);
        assertNull(PARSER.extractMerchant(text, fields, rule));
    }

    /** 实测竞态：商品说明早期 dump 只有类目行"日用百货"，加载完成后标签再现值为完整商品名 → 取完整版。 */
    @Test
    public void note_multiLineValueTakesRichest() throws Exception {
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(
                "自动扣款成功\n付款方式\n花呗\n商品说明\n日用百货\n支付时间\n2026-10-22 10:52:38\n"
                        + "商品说明\n活力28洗衣液花漾茉莉大瓶洁净衣物亮白增艳留香持久\n账单详情",
                rule);

        assertEquals("活力28洗衣液花漾茉莉大瓶洁净衣物亮白增艳留香持久", fields.get("商品说明"));
        assertEquals("活力28洗衣液花漾茉莉大瓶洁净衣物亮白增艳留香持久", PARSER.extractNote(fields, rule, null));
    }

    /** 实测场景（2026-10-31 真机）：微信扫码付款给个人（模板 1）→ 完整解析。 */
    @Test
    public void wechatScanPayTemplate1_parsesFully() throws Exception {
        String text = "扫二维码付款-给135790yaoywc\n-2.00\n当前状态\n支付成功\n收款方备注\n二维码收款\n"
                + "支付方式\n零钱通\n转账时间\n2026年10月31日 16:28:20\n转账单号\n10001073012026103101943180864627";
        JSONObject rule = wechatRule();

        assertNull(PARSER.checkPageSignature(text, rule));
        Map<String, String> fields = PARSER.extractFields(text, rule);
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(200L, r.minor);
        assertTrue(r.negative);
        assertEquals("135790yaoywc", PARSER.extractMerchant(text, fields, rule));
        assertEquals("二维码收款", PARSER.extractNote(fields, rule, null));
        assertEquals("expense:other-expense", PARSER.suggestCategory(
                PARSER.extractNote(fields, rule, null), PARSER.extractMerchant(text, fields, rule), rule));
        assertEquals("2026-10-31T16:28:20", PARSER.extractOccurredAt(fields, rule));
        assertEquals("expense", PARSER.decideDirection(text, fields, r.negative, rule, null));
    }

    /** 实测场景（2026-10-31 真机）：微信缴费优惠模板（模板 3，四川非税）→ 完整解析。 */
    @Test
    public void wechatFeeDiscountTemplate3_parsesFully() throws Exception {
        String text = "四川非税便捷收缴\n-259.00\n原价\n¥260.00\n优惠\n银行卡多笔立减优惠¥1.00\n"
                + "当前状态\n支付成功\n支付时间\n2026年10月31日 02:44:55\n"
                + "商品\n汽车、低速货车驾驶考试补考科目二-2250617227094\n商户全称\n四川省财政厅\n"
                + "收单机构\n财付通支付科技有限公司\n支付方式\n招商银行信用卡(8617)\n"
                + "交易单号\n4500000543202610312736009502\n账单详情";
        JSONObject rule = wechatRule();

        assertNull(PARSER.checkPageSignature(text, rule));
        Map<String, String> fields = PARSER.extractFields(text, rule);
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        // 商品单号"-2250617227094"不得被截取为金额；实付 -259.00 优先于原价 ¥260.00
        assertEquals(25900L, r.minor);
        assertTrue(r.negative);
        // 优惠值带文字前缀（"银行卡多笔立减优惠¥1.00"）→ 提取内嵌金额 100
        long[] discount = PARSER.extractDiscount(fields, rule, 25900L);
        org.junit.Assert.assertNotNull(discount);
        assertEquals(26000L, discount[0]);
        assertEquals(100L, discount[1]);
        assertEquals("四川省财政厅", PARSER.extractMerchant(text, fields, rule));
        assertEquals("汽车、低速货车驾驶考试补考科目二", PARSER.extractNote(fields, rule, "四川省财政厅"));
        assertEquals("expense:other-expense", PARSER.suggestCategory(
                PARSER.extractNote(fields, rule, "四川省财政厅"), PARSER.extractMerchant(text, fields, rule), rule));
        assertEquals("expense", PARSER.decideDirection(text, fields, r.negative, rule, null));
    }

    // ---------- 分类建议（备注 + 商户合并匹配） ----------

    @Test
    public void category_fromNoteKeyword() throws Exception {
        JSONObject rule = alipayRule();
        assertEquals("expense:utilities", PARSER.suggestCategory("燃气费", "燃气公司", rule));
        assertEquals("expense:insurance", PARSER.suggestCategory("2026.10月保费缴清-好医保·长期医疗", null, rule));
    }

    @Test
    public void category_wechatFoodFromNote() throws Exception {
        JSONObject rule = wechatRule();
        assertEquals("expense:food", PARSER.suggestCategory("三板斧牛杂面（温江店）-美团外卖", "美团", rule));
        assertEquals("expense:other-expense", PARSER.suggestCategory("汽车、低速货车驾驶考试补考科目二", null, rule));
    }

    @Test
    public void category_noMatchReturnsNull() throws Exception {
        JSONObject rule = alipayRule();
        assertNull(PARSER.suggestCategory("无名支出", "某某店", rule));
    }

    // ---------- 页面签名 ----------

    @Test
    public void pageSignature_alipayMatches() throws Exception {
        String text = "账单详情\n交易成功\n创建时间\n2026-10-31 11:03:34\n付款方式\n余额";
        assertNull(PARSER.checkPageSignature(text, alipayRule()));
    }

    /** 成功页不含"账单详情/创建时间" → 签名不匹配，不会误把成功页当详情页。 */
    @Test
    public void pageSignature_successPageDoesNotMatch() throws Exception {
        String text = "支付成功\n¥28.00\n缴费机构处理中\n支付有礼";
        assertNotNull(PARSER.checkPageSignature(text, alipayRule()));
    }

    /** 提现/转账详情页没有"付款方式"，但有"提现到" → requireAnyOf 兜住，签名通过（PRD §6.1）。 */
    @Test
    public void pageSignature_withdrawPagePassesViaRequireAnyOf() throws Exception {
        String text = "账单详情\n交易成功\n创建时间\n2026-10-31 09:12:00\n"
                + "提现到\n中信银行(5441)\n处理进度\n已到账";
        assertNull(PARSER.checkPageSignature(text, alipayRule()));
    }

    /** 普通页面（支付宝首页：付款码/活动文案/余额数字）不含"账单详情" → 签名拒绝，不捕获。 */
    @Test
    public void pageSignature_homePageRejected() throws Exception {
        String text = "扫一扫\n收付款\n余额宝\n¥140.00\n领红包\n立减20元\n松开刷新\n查看往来记录";
        assertNotNull(PARSER.checkPageSignature(text, alipayRule()));
    }

    // ---------- 测试用规则（与 CaptureRuleDefaults / 前端 DEFAULT_RULES 同步） ----------

    // ---------- 还花呗（2026-11-08 读屏实测） ----------

    /** 2026-11-08 还花呗账单详情读屏原文（文本节点按树序摊平，与 extractVisibleText 同源）。
     * 含"服务详情"行——15:25 实机完整渲染后多出的"花呗自动还款-2026年11月账单"
     * 正是把金额带偏成 -2026 的元凶（11:55 首次读屏时该行尚未渲染，夹具必须含它）。 */
    private static final String HUABEI_DUMP =
            "花呗\n580.47元\n还款成功\n"
                    + "创建时间\n2026-11-08 08:44:55\n2026-11-08 08:44:55\n"
                    + "付款方式\n中信银行储蓄卡(5441) \n"
                    + "还款到\n花呗\n花呗\n服务详情\n花呗自动还款-2026年11月账单\n查看详情\n更多\n"
                    + "账单管理\n我的消费图鉴\n"
                    + "账单分类\n信用借还\n标签\n请选择\n为您推荐\n计入收支\n开关\n备注\n添加\n"
                    + "对此订单有疑问\n账单详情\n全部账单";

    /** 支付宝·还花呗规则（与 CaptureRuleDefaults.alipayHuabeiRepaymentRule / 前端 alipay-huabei-repayment 同步）。 */
    private static JSONObject huabeiRule() throws Exception {
        return new JSONObject("{\"id\":\"alipay-huabei-repayment\",\"name\":\"支付宝·还花呗\","
                + "\"packageName\":\"com.eg.android.AlipayGphone\","
                + "\"pageSignature\":{\"requireAll\":[\"还款成功\",\"花呗\"],"
                + "\"requiredAnyLabel\":[\"创建时间\",\"支付时间\",\"还款时间\"],"
                + "\"requireAnyOf\":[\"还款到\",\"付款方式\"]},"
                + "\"fieldAliases\":{"
                + "\"occurredAtLabel\":[\"创建时间\",\"支付时间\",\"还款时间\"],"
                + "\"accountLabel\":[\"付款方式\",\"支付方式\"],"
                + "\"orderIdLabel\":[\"交易单号\",\"订单号\"]},"
                + "\"directionRule\":{\"negative\":\"expense\","
                + "\"selfTransferFields\":[\"还款到\",\"付款方式\"],\"refundFields\":[\"退款\"],\"default\":\"transfer\"},"
                + "\"defaultTargetAccountHint\":\"花呗\","
                + "\"categoryMappings\":[]}}");
    }

    /** 读屏原文通过还花呗签名（还款成功+花呗+还款到）。 */
    @Test
    public void huabei_pageSignature_matchesRealDump() throws Exception {
        assertNull(PARSER.checkPageSignature(HUABEI_DUMP, huabeiRule()));
    }

    /** 金额无标签（"580.47元"顶格）→ 整页扫描取 58047；时间串/卡号尾缀被剔除不污染。 */
    @Test
    public void huabei_paidAmount_unlabeledTopAmount() throws Exception {
        Map<String, String> fields = PARSER.extractFields(HUABEI_DUMP, huabeiRule());
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(HUABEI_DUMP, fields, huabeiRule());
        assertEquals(58047L, r.minor);
        assertFalse(r.negative);
    }

    /** 方向：含"还款到"（自账户划转）→ transfer，不再 confirm。 */
    @Test
    public void huabei_direction_transfer() throws Exception {
        Map<String, String> fields = PARSER.extractFields(HUABEI_DUMP, huabeiRule());
        assertEquals("transfer", PARSER.decideDirection(HUABEI_DUMP, fields, false, huabeiRule(), null));
    }

    /** 字段：时间取创建时间 → ISO；转出账户取付款方式（卡号尾缀保留给账户匹配器）。 */
    @Test
    public void huabei_fields_timeAndAccount() throws Exception {
        Map<String, String> fields = PARSER.extractFields(HUABEI_DUMP, huabeiRule());
        assertEquals("2026-11-08T08:44:55", PARSER.extractOccurredAt(fields, huabeiRule()));
        assertEquals("中信银行储蓄卡(5441)", PARSER.extractFirstField(
                fields, huabeiRule().optJSONObject("fieldAliases"), "accountLabel"));
    }

    /** 回归（2026-11-08 实机）：服务详情行"花呗自动还款-2026年11月账单"的"-2026"
     * 不再被当带负号金额（此前负号优先级稳压实付 580.47，并把方向带成 expense）。 */
    @Test
    public void huabei_paidAmount_serviceDetailLine_notPolluted() throws Exception {
        // HUABEI_DUMP 已含该行：完整真实文本下金额必须仍是 580.47
        Map<String, String> fields = PARSER.extractFields(HUABEI_DUMP, huabeiRule());
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(HUABEI_DUMP, fields, huabeiRule());
        assertEquals(58047L, r.minor);
        assertFalse(r.negative);
    }

    /** 纯日期串剔除：中文年月(日)与 ISO 日期（不带时间）都不留数字组。 */
    @Test
    public void stripNoise_removesDateOnlyStrings() {
        String out = DetailPageParser.stripNonAmountNoise(
                "花呗自动还款-2026年11月账单\n2026-11-08\n2026/11/8\n2026年11月8日");
        assertFalse(out.matches("(?s).*\\d{4}.*"));
    }

    /** 渐进加载竞态：时间值只渲染出日期"2026-11-08"（时间未到）→ 不再产出 2026/-11 候选。 */
    @Test
    public void huabei_paidAmount_dateOnlyTimeValue_notPolluted() throws Exception {
        String text = "花呗\n580.47元\n还款成功\n创建时间\n2026-11-08\n"
                + "付款方式\n中信银行储蓄卡(5441)\n还款到\n花呗";
        Map<String, String> fields = PARSER.extractFields(text, huabeiRule());
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, huabeiRule());
        assertEquals(58047L, r.minor);
        assertFalse(r.negative);
    }

    /** 回归锚点：通用账单详情规则在本页仍判 confirm（+无备注 → 服务层残缺页丢弃）——这正是"没跳转"的根因。 */
    @Test
    public void huabei_genericRuleStillConfirms_whyDedicatedTemplateExists() throws Exception {
        Map<String, String> fields = PARSER.extractFields(HUABEI_DUMP, alipayRule());
        assertEquals("confirm", PARSER.decideDirection(HUABEI_DUMP, fields, false, alipayRule(), null));
    }

    private static JSONObject alipayRule() throws Exception {
        return new JSONObject("{\"id\":\"alipay-bill-detail\",\"name\":\"支付宝·账单详情\","
                + "\"packageName\":\"com.eg.android.AlipayGphone\","
                + "\"layoutExtract\":{\"merchant\":{\"anchor\":\"amount\",\"offset\":-1}},"
                + "\"pageSignature\":{\"requireAll\":[],"
                + "\"requiredLabels\":[],\"requiredAnyLabel\":[\"创建时间\",\"支付时间\",\"收款时间\"],"
                + "\"requireAnyOf\":[\"交易成功\",\"转账成功\",\"收款成功\",\"付款成功\",\"自动扣款成功\",\"付款方式\",\"转账备注\",\"对方账户\",\"提现到\",\"收款方式\",\"处理进度\"]},"
                + "\"fieldAliases\":{"
                + "\"amountLabel\":[\"实付金额\",\"实收金额\",\"金额\"],"
                + "\"orderAmountLabel\":[\"订单金额\"],"
                + "\"discountLabel\":[\"红包\",\"优惠\",\"满减\",\"立减\"],"
                + "\"occurredAtLabel\":[\"创建时间\",\"支付时间\",\"交易时间\",\"转账时间\"],"
                + "\"accountLabel\":[\"付款方式\",\"支付方式\"],"
                + "\"merchantLabel\":[\"对方账户\",\"收款方\",\"商户\",\"商家\"],"
                + "\"noteLabel\":[\"缴费说明\",\"交易详情\",\"转账备注\",\"商品说明\",\"理由\",\"商品\"],"
                + "\"orderIdLabel\":[\"订单号\",\"商户单号\",\"交易单号\",\"户号\"]},"
                + "\"noteRule\":{\"preferFields\":[\"缴费说明\",\"交易详情\",\"转账备注\",\"商品说明\",\"商品\",\"理由\"],\"maxLength\":50,"
                + "\"cleanPatterns\":[\"订单编号\\\\d+$\",\"App-\\\\d+$\",\"[-–]\\\\*+[^-–]*$\",\"[-–]\\\\d{6,}$\"],\"fallbackToMerchant\":true},"
                + "\"directionRule\":{\"negative\":\"expense\",\"externalIncomeFields\":[\"对方账户\",\"转账备注\"],"
                + "\"selfTransferFields\":[\"提现到\",\"收款方式\",\"处理进度\"],\"refundFields\":[\"退款\"],\"default\":\"confirm\"},"
                + "\"categoryMappings\":["
                + "{\"namePattern\":\"(燃气|水费|电费|话费|宽带|物业)\",\"categoryId\":\"utilities\",\"kind\":\"expense\"},"
                + "{\"namePattern\":\"(保险|保费|好医保)\",\"categoryId\":\"insurance\",\"kind\":\"expense\"},"
                + "{\"namePattern\":\"(外卖|餐饮|奶茶|咖啡|麻辣烫)\",\"categoryId\":\"food\",\"kind\":\"expense\"},"
                + "{\"namePattern\":\"(超市|便利店|盒马)\",\"categoryId\":\"grocery\",\"kind\":\"expense\"},"
                + "{\"namePattern\":\"(零食|小吃|坚果|卤味|牛蹄筋|牛肉干)\",\"categoryId\":\"food\",\"kind\":\"expense\"},"
                + "{\"namePattern\":\"(提现|返现|退款|红包|签到|奖励|返款)\",\"categoryId\":\"income-other\",\"kind\":\"income\"}]}}");
    }

    private static JSONObject wechatRule() throws Exception {
        return new JSONObject("{\"id\":\"wechat-bill-detail\",\"name\":\"微信·账单详情\","
                + "\"packageName\":\"com.tencent.mm\","
                + "\"layoutExtract\":{\"merchant\":{\"anchor\":\"amount\",\"offset\":-1,\"stripPrefix\":\"扫二维码付款-给\"}},\"pageSignature\":{\"requireAll\":[\"支付成功\"],\"requiredLabels\":[\"支付方式\"],\"requiredAnyLabel\":[\"支付时间\",\"转账时间\",\"收款时间\",\"交易单号\",\"转账单号\",\"商户单号\"]},"
                + "\"fieldAliases\":{"
                + "\"amountLabel\":[\"实付金额\",\"金额\"],"
                + "\"orderAmountLabel\":[\"原价\",\"订单金额\"],"
                + "\"originalPriceLabel\":[\"原价\"],"
                + "\"discountLabel\":[\"优惠\"],"
                + "\"occurredAtLabel\":[\"支付时间\",\"收款时间\",\"转账时间\"],"
                + "\"accountLabel\":[\"支付方式\"],"
                + "\"merchantLabel\":[\"商户全称\",\"商户\"],"
                + "\"noteLabel\":[\"商品\",\"收款方备注\",\"商户全称\"],"
                + "\"orderIdLabel\":[\"交易单号\",\"商户单号\",\"转账单号\"]},"
                + "\"noteRule\":{\"preferFields\":[\"商品\",\"收款方备注\",\"商户全称\"],\"maxLength\":50,"
                + "\"cleanPatterns\":[\"订单编号\\\\d+$\",\"App-\\\\d+$\",\"[-–]\\\\d{6,}$\",\"-\\\\d{4,}$\"],"
                + "\"fallbackToMerchant\":true},"
                + "\"directionRule\":{\"negative\":\"expense\",\"externalIncomeField\":\"\","
                + "\"selfTransferFields\":[],\"refundFields\":[\"退款\"],\"default\":\"confirm\"},"
                + "\"categoryMappings\":["
                + "{\"namePattern\":\"(外卖|牛杂|麻辣烫|奶茶|咖啡|餐饮|餐厅)\",\"categoryId\":\"food\",\"kind\":\"expense\"},"
                + "{\"namePattern\":\"(考试|驾考|车管|财政|非税|罚款)\",\"categoryId\":\"other-expense\",\"kind\":\"expense\"},"
                + "{\"namePattern\":\"(橙子|苹果|香蕉|水果|零食|小吃)\",\"categoryId\":\"food\",\"kind\":\"expense\"},"
                + "{\"namePattern\":\"(二维码收款|扫码付款|扫码)\",\"categoryId\":\"other-expense\",\"kind\":\"expense\"}]}}");
    }

    private static JSONObject transferInRule() throws Exception {
        return new JSONObject("{\"id\":\"wechat-transfer-in\",\"name\":\"微信·转账收入\","
                + "\"packageName\":\"com.tencent.mm\","
                + "\"layoutExtract\":{\"merchant\":{\"anchor\":\"amount\",\"offset\":-1,\"stripPrefixPattern\":\"^(商家转账|转账)-来自\"}},"
                + "\"pageSignature\":{\"requireAll\":[\"-来自\"],"
                + "\"requiredAnyLabel\":[\"付款商家\",\"转账说明\",\"当前状态\",\"收款时间\"]},"
                + "\"fieldAliases\":{"
                + "\"amountLabel\":[\"金额\"],"
                + "\"occurredAtLabel\":[\"转账时间\",\"收款时间\"],"
                + "\"merchantLabel\":[\"付款商家\"],"
                + "\"noteLabel\":[\"付款备注\",\"转账说明\"],"
                + "\"orderIdLabel\":[\"付款单号\",\"转账单号\"]},"
                + "\"noteRule\":{\"preferFields\":[\"付款备注\",\"转账说明\"],\"maxLength\":50},"
                + "\"directionRule\":{\"negative\":\"expense\",\"default\":\"income\"},"
                + "\"categoryMappings\":["
                + "{\"namePattern\":\"(现金红包|红包|返现|奖励|签到|开盲盒)\",\"categoryId\":\"income-other\",\"kind\":\"income\"}]}}");
    }

    /** 实测场景（2026-10-31 真机）：商家转账（模板 D，美团签到红包）→ income。 */
    @Test
    public void wechatMerchantTransfer_parsesFully() throws Exception {
        String text = "商家转账-来自美团\n+0.60\n付款商家\n北京三快在线科技有限公司\n收款方式\n零钱\n"
                + "转账时间\n2026年10月29日 10:48:42\n付款单号\n1310005090713001493890320261029\n"
                + "付款备注\n天天开盲盒现金红包";
        JSONObject rule = transferInRule();

        assertNull(PARSER.checkPageSignature(text, rule));
        Map<String, String> fields = PARSER.extractFields(text, rule);
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(60L, r.minor);
        assertFalse(r.negative);
        assertEquals("北京三快在线科技有限公司", PARSER.extractMerchant(text, fields, rule));
        System.out.println("[DEBUG] fields=" + fields);
        System.out.println("[DEBUG] note=" + PARSER.extractNote(fields, rule, "北京三快在线科技有限公司"));
        assertEquals("天天开盲盒现金红包", PARSER.extractNote(fields, rule, "北京三快在线科技有限公司"));
        assertEquals("income", PARSER.decideDirection(text, fields, r.negative, rule, null));
        assertEquals("income:income-other", PARSER.suggestCategory(
                PARSER.extractNote(fields, rule, "北京三快在线科技有限公司"),
                PARSER.extractMerchant(text, fields, rule), rule));
    }

    /** 实测场景：个人转账（模板 E，朋友转账）→ 商户取标题剥前缀，income。 */
    @Test
    public void wechatPersonalTransfer_parsesFully() throws Exception {
        String text = "转账-来自东哥锅盔\n+6.00\n当前状态\n已存入零钱\n转账说明\n微信转账\n"
                + "转账时间\n2026年10月20日 16:23:22\n收款时间\n2026年10月20日 16:23:28\n"
                + "转账单号\n1000050001202610200023256110783";
        JSONObject rule = transferInRule();

        assertNull(PARSER.checkPageSignature(text, rule));
        Map<String, String> fields = PARSER.extractFields(text, rule);
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(600L, r.minor);
        assertFalse(r.negative);
        assertEquals("东哥锅盔", PARSER.extractMerchant(text, fields, rule));
        assertEquals("微信转账", PARSER.extractNote(fields, rule, "东哥锅盔"));
        assertEquals("income", PARSER.decideDirection(text, fields, r.negative, rule, null));
    }

    // ---------- 实测 2026-11-06：实付语义行 / 优惠行排除 ----------

    /**
     * 美团单（实测 2026-11-06）：大金额"支出19.72元"无符号、优惠行"美团红包 -1.08"带负号。
     * 旧算法"带负号绝对优先"取 1.08 并把优惠算成 19.72（实付/优惠整体颠倒）；
     * 行语义修复后取实付 19.72，方向按行语义判 expense（不再弹"可能是收入或转账"）。
     */
    @Test
    public void paidAmount_paidLabeledLine_beatsSignedDiscount() throws Exception {
        String text = "账单详情\n美团\n支出19.72元\n交易成功\n订单金额\n20.80\n美团红包\n-1.08\n"
                + "支付时间\n2026-11-06 00:30:00\n付款方式\n花呗\n商品说明\n老成都现炒盖浇饭-美团外卖App-26110511100300001304482249626664";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(1972L, r.minor);
        assertFalse(r.negative);
        assertEquals("expense", r.paidLineKind);
        // 方向：金额行含"支出"语义 → expense（不再 confirm）
        assertEquals("expense", PARSER.decideDirection(text, fields, r.negative, rule, r.paidLineKind));
        // 备注取"商品说明"并清洗平台尾缀（"App-订单号"一起清，结果更干净）
        assertEquals("老成都现炒盖浇饭-美团外卖", PARSER.extractNote(fields, rule, "美团"));
        // 商户：布局锚点向上跳过"订单金额"标签行
        assertEquals("美团", PARSER.extractMerchant(text, fields, rule));
    }

    /** 无符号"支出"实付（天猫等待确认收货单，实测 2026-11-06）→ 行语义判 expense。 */
    @Test
    public void direction_paidLabeledUnsigned_isExpense() throws Exception {
        String text = "账单详情\n天猫\n支出5.19元\n等待确认收货\n支付时间\n2026-11-05 14:15:59\n"
                + "付款方式\n花呗\n商品说明\n黄桃罐头水果罐头510g";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);
        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(519L, r.minor);
        assertEquals("expense", PARSER.decideDirection(text, fields, r.negative, rule, r.paidLineKind));
    }

    /**
     * 蜜雪冰城团购券（实测）：实付 -0.01、团购神券 -3.99（行含"券"）。
     * 旧算法取绝对值最大的 -3.99；修复后"券"行排除，取实付 0.01，
     * 优惠 = 订单金额 4.00 − 实付 0.01 = 3.99。
     */
    @Test
    public void paidAmount_discountLineExcluded_groupBuyCoupon() throws Exception {
        String text = "账单详情\n蜜雪冰城\n-0.01\n交易成功\n订单金额\n4.00\n团购神券\n-3.99\n"
                + "支付时间\n2026-11-02 11:48:28\n付款方式\n花呗\n收款方全称\n郑州宝岛科技有限公司";
        JSONObject rule = alipayRule();
        Map<String, String> fields = PARSER.extractFields(text, rule);

        DetailPageParser.AmountResult r = PARSER.extractPaidAmount(text, fields, rule);
        assertEquals(1L, r.minor);
        assertTrue(r.negative);
        long[] discount = PARSER.extractDiscount(fields, rule, r.minor);
        assertNotNull(discount);
        assertEquals(400L, discount[0]);
        assertEquals(399L, discount[1]);
    }
}
