# 自动记账 · 账单详情 / 订单详情匹配 PRD

- 文档版本：v1.0
- 撰写日期：2026-10-31
- 关联分支：`feature/simplest-capture-record`
- 状态：待评审（供开发同事按此 PRD 实施）

---

## 0. 一页看懂

**问题**：现在的自动记账只匹配"支付成功页"，但成功页是广告模板页、字段不全，导致燃气费、保险这类支出经常没被自动记录（用户实测两笔都漏了）。

**方案**：在"支付成功页"之外，增加**账单详情 / 订单详情匹配**作为兜底。用户在支付宝/微信点进某笔账单详情、或在美团/京东/拼多多点进某笔订单详情时，无障碍服务识别该页面、按**结构化字段**（金额/时间/付款方式/说明/对方账户）提取一笔记账事件，并**自动生成备注**（"为什么花"），预填到记账表单。

**必须按 APP 区分**，因为支付类与购物类的"账单"体系本质不同：

| | 支付类（支付宝 / 微信） | 购物类（美团 / 拼多多 / 京东） |
|---|---|---|
| 页面类型 | 账单详情页 | 订单详情页 |
| 备注素材 | 缴费说明 / 交易详情 / 理由 / 转账备注 | 商品名（如"麻辣烫""奶茶"） |
| 备注示例 | "燃气费"、"好医保保费"、"余额提现" | "外卖-麻辣烫" |

**关键优先级**：购物类 APP 的钱几乎都走支付宝/微信支付，所以**先做好支付宝 + 微信账单详情**（解决"记没记到"），购物类订单详情是补充（解决"备注够不够细" + 覆盖站内余额/白条/月付场景）。

**核心目标**：让自动记账真正有用——**备注是灵魂**。只记金额+类目+账户、丢了"为什么花"，记了等于白记。

---

## 1. 背景与问题

### 1.1 现状

当前自动记账链路（已有实现）：

```
无障碍窗口变化事件
  └→ PaymentAccessibilityService.onAccessibilityEvent
       └→ 遍历窗口 root → processWindow
            ├→ RuleBasedParser（用户 JSON 规则，按包名路由 + priority）
            ├→ AlipayAdapter / WechatAdapter / GenericPaymentAdapter（硬编码兜底）
            └→ CapturedPaymentInfo{amountMinor, merchant, accountHint, orderNo, suggestedCategory, defaultAccountId}
                 ├→ CaptureDedup 去重（按 包名+金额+分钟桶）
                 ├→ capture_queue（Room，status=pending）
                 ├→ notifyCandidate → WebView（待确认事件）
                 └→ launchRecordForCapture → 拉起记账页预填 → 用户保存 → transactions 表
```

### 1.2 已知问题（实测）

1. **成功页不可靠**：支付宝/微信的"支付成功"页是广告模板页，除一个大金额外全是干扰（"缴费机构处理中""支付有礼""保险推荐"等）。现有 `AlipayAdapter` 只能在整页文本里正则硬抓一个金额、撞大运匹配商户名，字段不全，导致燃气费、保险漏记。
2. **丢了备注**：`CapturedPaymentInfo` 没有 note 字段，`RecordSheet` 预填只有金额/商户/日期，用户确认后也**丢失了"为什么花"**。事后回看只剩一笔数字，想不起用途。
3. **去重键过弱**：`CaptureDedup` 按 `(包名, 金额, 分钟桶)` 去重，**仅按金额会误杀**——同一天两笔 30 元是合法存在的。
4. **白名单缺口**：`WhitelistPackages.ALL` 只有 支付宝/微信/京东/美团/抖音，**拼多多不在**。
5. **来源未落库**：`transaction-repository.ts` 插入 `transactions` 时把 `capture_source / parser_version / confidence` **硬编码为 NULL**，无法按来源审计/筛选。

### 1.3 用户诉求（本次需求核心）

- **按 APP 区分**：识别到支付宝就套支付宝账单逻辑、微信套微信、京东/美团/拼多多套订单逻辑。
- **自动填备注**：不只是记金额/类目/账户，要自动识别"这笔钱为什么花"，写入备注，事后回看能想起来。
- **兜底链路**：支付完没自动跳转时，通过账单详情匹配。

---

## 2. 目标与非目标

### 2.1 目标（本次交付）

1. 识别**支付宝 / 微信的账单详情页**，按"标签→值"结构化提取：金额（**实付金额**）、方向、创建时间、付款方式、说明/备注、对方账户、订单号/户号。
2. 识别**美团 / 拼多多 / 京东的订单详情页**，提取：实付金额、商品名、下单时间。
3. 自动生成**备注**并一路带到记账表单，落库 `transactions.note`。
4. 按**已处理指纹**去重，避免重复记录、重复弹窗。
5. 方向判断：负金额→支出；正金额按"理由/交易类型"语义判断，**v1 只自动处理支出**，正金额一律弹确认。
6. 修复 `capture_source` 落库为 NULL 的问题。
7. 白名单补充拼多多。

### 2.2 非目标（本次不做，明确排除）

- ❌ **不做自动导航 / 模拟点击**（侵入式）：服务保持只读监听（`accessibility_config.xml` 只注册窗口变化事件）。用户手动点进详情页时被动识别即可，不自动找条目点击进入。
- ❌ **不做批量导入账单**（用户明确担心的冲突来源，详情匹配天然单笔、冲突小）。
- ❌ **不做 OCR**：无障碍读到的就是文本节点，图片内嵌文字拿不到（已知边界，见 §11）。
- ❌ **不做收入类自动入账**：正金额一律弹确认，不自动落账。

---

## 3. 术语

| 术语 | 含义 |
|---|---|
| 支付账单体系 | 支付宝/微信。有完整"账单→账单详情"体系，字段结构化（金额/时间/付款方式/说明/对方/订单号）。 |
| 购物订单体系 | 美团/拼多多/京东。无"账单"，只有"我的订单→订单详情"，备注素材是商品名。 |
| 页面特征签名 | 用于判断"当前页面是否是目标详情页"的一组特征（文本关键词 + 标签存在性）。 |
| 字段别名 | 同一字段在不同 APP/版本上的不同标签措辞，如备注在支付宝叫"缴费说明"、微信叫"交易类型"。 |
| 备注提取规则 | 从页面文本中选出"为什么花"的规则（优先字段、长度截断、关键词清洗）。 |
| 指纹（fingerprint） | 一笔交易的唯一标识，用于去重。优先订单号/户号，其次 (金额+时间+商户)。 |
| 实付金额 | 用户实际支付的金额 = 订单金额 − 红包 − 优惠。**不是订单金额**。 |

---

## 4. 现状与已有能力（实现时可直接复用）

| 能力 | 位置 | 状态 |
|---|---|---|
| 包名路由（按 APP 区分） | `PaymentParserRegistry`、`RuleBasedParser.findBestRule()`（按 packageName + priority） | ✅ 已有 |
| 整页文本摊平 | `PaymentParserAdapter.extractVisibleText()`（递归节点树，text+contentDescription） | ✅ 已有 |
| 金额→分转换 | `CapturedPaymentInfo.parseAmountMinor()` | ✅ 已有 |
| 分类建议（关键词→类目） | `RuleBasedParser.suggestCategory()` + `categoryMappings` | ✅ 已有 |
| 捕获队列 | `capture_queue`（Room），字段含 merchant/accountHint/sourceOrderId/rawFingerprint/confidence/parserVersion/suggestedCategory | ✅ 已有 |
| 拉起记账页预填 | `PaymentCapturePlugin.launchRecordForCapture` → `App.vue.checkPendingCaptureData` → `/transactions/new` → `RecordSheet` | ✅ 已有 |
| 延迟重试（动态加载） | `processWindow()` 分 5 次重试（100/300/600/1000/1500ms） | ✅ 已有 |
| **note 字段** | `CapturedPaymentInfo` ❌ 无；`capture_queue` ❌ 无；`transactions` ✅ 有 | ❌ 需补 |
| **详情页识别分支** | 无（只有成功关键词匹配） | ❌ 需新增 |
| **指纹去重** | `CaptureDedup` 仅 `(包名, 金额, 分钟桶)`，过弱 | ❌ 需重做 |
| **capture_source 落库** | 插入恒为 NULL | ❌ 需修 |
| **拼多多白名单** | 不在 `WhitelistPackages.ALL` | ❌ 需补 |

---

## 5. 总体方案

### 5.1 设计原则

1. **沿用"被动识别 + 包名路由"**，不加侵入式能力，不改服务注册配置。
2. **按"体系类型"分两组解析模板**，逻辑不按 APP 重复；每个 APP 只配一份轻量 JSON（字段别名 + 页面签名 + 备注规则 + 分类映射）。
3. **规则格式向后兼容**：现有 `CaptureRule` 无 `pageType`，默认视为"成功页规则"；新增 `pageType: bill-detail | order-detail` 的规则。`version` 升到 2。
4. **详情页规则优先级高于成功页规则**（同一包名下优先命中详情页）。
5. **备注与分类联动**：备注关键词可反哺 `suggestedCategory`（燃气费→充值缴费、保费→保险、麻辣烫→餐饮）。

### 5.2 解析优先级（新增后的 processWindow 决策）

```
窗口事件 → 包名白名单 → 摊平文本
  ├→ ① 详情页规则（pageType=bill-detail/order-detail，优先）  → 命中 → 走详情解析
  ├→ ② 成功页规则（pageType 缺省）                            → 命中 → 走原解析
  └→ ③ 硬编码适配器兜底（Alipay/Wechat/Generic）
```

### 5.3 数据流（新增部分加粗）

```
用户打开支付宝→全部账单→点进某笔账单详情
  └→ 无障碍窗口事件
       └→ 包名路由 → 详情页规则命中（页面特征签名校验）
            └→ 结构化解析（标签→值）：实付金额/方向/时间/付款方式/说明/对方/订单号
                 ├→ 【指纹查重】命中 → 静默丢弃（不弹窗）
                 ├→ 【备注生成】说明/商品名 → note
                 ├→ 【方向判断】负→支出（自动）；正→弹确认
                 ├→ 【分类建议】备注/商户关键词 → suggestedCategory
                 └→ capture_queue（含 note）→ notifyCandidate + launchRecordForCapture
                      └→ 记账页预填（金额/商户/日期/**备注**）
                           └→ 用户保存 → transactions（note、**capture_source** 落库）
                                └→ 【写指纹】确认落账后写入 fingerprint 表
```

---

## 6. 体系一：支付账单体系（支付宝 / 微信）

### 6.1 页面特征签名（支付宝 / 微信实测校准）

> ⚠️ **实测结论（2026-10-31 真机截图校准）**：支付宝账单详情页**有**"账单详情"标题；微信账单详情页**没有**"账单详情"标题，顶部直接是商户名。两者签名必须分开定义。

**支付宝·账单详情**（`requireAll` 全部命中，业务字段 `requireAnyOf` 至少命中其一）：

| 特征 | 取值 |
|---|---|
| 标题关键词 | `账单详情` |
| 交易状态 | `交易成功` |
| 必备标签 | `创建时间` |
| 业务字段（任一命中） | `付款方式`（消费）、`转账备注`/`对方账户`（外部打款）、`提现到`/`收款方式`/`处理进度`（自账户提现/转账） |

> ⚠️ 提现/转账详情页**没有"付款方式"**（图二只有"提现到"，图三只有"收款方式"），故签名**不能强制"付款方式"**，改用 `requireAnyOf`（至少命中一个业务字段）。

**微信·账单详情**（`requireAll` 全部命中）：

| 特征 | 取值 |
|---|---|
| 交易状态 | `当前状态` 值含 `支付成功` |
| 必备标签 | `支付时间`、`支付方式`、`交易单号` |
| 辅助特征 | 页面含大金额 + `商户全称`/`商品`（用于排除非交易页） |

**微信·红包收款页（子类型）**：标题含 `微信红包-来自` + 金额 + `收款时间` + `当前状态：已存入零钱` → 收入（+）。

> 注意：`支付成功`/`成功` 类词在**任何**支付页都出现，微信签名必须靠 `支付时间` + `支付方式` + `交易单号` 三个标签同时命中，避免与成功页误判。

### 6.2 字段别名表（支付宝 / 微信实测截图 → 标签）

**支付宝标签（实测）**：

| 逻辑字段 | 支付宝标签（实测） |
|---|---|
| 实付金额 | 页面最大带符号金额（图3 `-28.00`） |
| 订单金额 | `订单金额` |
| 红包/优惠 | `红包` `优惠` `满减` |
| 时间 | `创建时间` |
| 付款方式 | `付款方式` |
| 对方/商户 | `对方账户`（图4）、商户名（图2/3 顶部） |
| **备注** | `缴费说明`（图3）、`交易详情`（图2）、`理由`/`转账备注`（图4） |
| 订单号/指纹 | `户号`（图3）、`交易单号` |

**微信标签（实测）**：

| 逻辑字段 | 微信标签（实测） |
|---|---|
| 实付金额 | 页面最大带符号金额（图2 `-16.56`、图4 `-259.00`） |
| 原价 | `原价` |
| 优惠 | `优惠`（如"砸金蛋1.11元优惠¥1.11"） |
| 时间 | `支付时间`（收款/转账页为 `收款时间`） |
| 支付方式 | `支付方式`（如"成都银行储蓄卡(0652)"） |
| 商户 | `商户全称`（图3/4）、顶部标题（图2"美团"） |
| 收单机构 | `收单机构`（可作账户线索补充） |
| **备注** | `商品`（需清洗订单号尾缀）、`商户全称` |
| 订单号/指纹 | `交易单号`、`商户单号` |

> ⚠️ 微信 `商品` 字段可能是纯订单号（图3 `京东-订单编号3667279014011752`，无真实商品名），备注需清洗 + 无意义降级（见 §6.5）。

### 6.3 金额、时间与方向（关键坑，必须写清楚）

- **实付金额 ≠ 订单金额**。支付宝图3：订单金额 `30.00`、红包 `-2.00`、实付 `-28.00`，**要记 28，不是 30**。实付金额取"页面上绝对值最大的带符号金额"，优先取 `实付`/`实收` 标签旁的值；微信页面直接给负数（`-16.56`），取大数字即可，**不需要**用"原价 − 优惠"计算（可选做一致性校验：`|大数字| ≈ 原价 − 优惠`，不一致仍以页面大数字为准）。
- **时间格式双格式**（重要，实测发现）：
  - 支付宝：ISO 格式 `2026-10-31 11:03:34`
  - 微信：中文格式 `2026年10月29日 13:24:44`
  - 解析器需**同时兼容两种格式**，统一转换为 ISO 存储（`occurredAt`）。
- **方向判断：以字段结构为主，符号为辅**（用户核心洞察）。负金额 → 支出；正/无符号金额 → 按字段组合判定（见 §6.6）。⚠️ 图二 `300.00` **不带正负号**，不能只看符号。
- **备注素材**（实测）：
  - 支付宝燃气费 → 缴费说明 `燃气费-*贤萍` → 备注"燃气费"
  - 支付宝保险 → 交易详情 `2026.10月保费缴清-好医保·长期医疗…` → 备注"好医保保费"
  - 支付宝外部打款（图一）→ 转账备注 `支付宝余额提现` + 对方账户"外卖名堂" → 备注"外卖名堂打款"（收入）
  - 支付宝自账户提现（图二）→ 提现到 `中信银行(5441)` → 备注"提现至中信银行(5441)"
  - 支付宝小荷包转出（图三）→ 服务详情 `支付宝小荷包-转出到银…` → 备注"小荷包转出"
  - 微信美团 → 商品 `三板斧牛杂面（温江店）-美团外卖App-2610…` → 备注"三板斧牛杂面（温江店）-美团外卖"
  - 微信非税 → 商品 `汽车、低速货车驾驶考试补考科目二-2250…` → 备注"汽车驾驶补考科目二"

### 6.4 配置 JSON 示例（支付宝·账单详情）

```json
{
  "id": "alipay-bill-detail",
  "name": "支付宝·账单详情",
  "packageName": "com.eg.android.AlipayGphone",
  "channel": "accessibility",
  "pageType": "bill-detail",
  "pageSignature": {
    "requireAll": ["账单详情", "交易成功"],
    "requiredLabels": ["创建时间", "付款方式"]
  },
  "fieldAliases": {
    "amountLabel": ["实付金额", "实收金额", "金额"],
    "orderAmountLabel": ["订单金额"],
    "discountLabel": ["红包", "优惠", "满减", "立减"],
    "occurredAtLabel": ["创建时间", "交易时间", "转账时间"],
    "accountLabel": ["付款方式", "支付方式"],
    "merchantLabel": ["对方账户", "收款方", "商户", "商家"],
    "noteLabel": ["缴费说明", "交易详情", "理由", "转账备注", "商品"],
    "orderIdLabel": ["订单号", "商户单号", "交易单号", "户号"]
  },
  "noteRule": {
    "preferFields": ["缴费说明", "交易详情", "商品", "理由"],
    "maxLength": 50,
    "cleanPatterns": ["^.*[-*]([^-*]+)$"]
  },
  "directionRule": {
    "negative": "expense",
    "externalIncomeField": "对方账户",
    "selfTransferFields": ["提现到", "收款方式", "处理进度"],
    "refundFields": ["退款"],
    "default": "confirm"
  },
  "categoryMappings": [
    { "namePattern": "(燃气|水费|电费|话费|宽带|物业)", "categoryId": "utilities", "kind": "expense" },
    { "namePattern": "(保险|保费|好医保)", "categoryId": "insurance", "kind": "expense" },
    { "namePattern": "(外卖|餐饮|奶茶|咖啡|麻辣烫)", "categoryId": "food", "kind": "expense" },
    { "namePattern": "(超市|便利店|盒马)", "categoryId": "grocery", "kind": "expense" }
  ],
  "enabled": true,
  "priority": 200
}
```

**微信·账单详情（实测校准，`pageSignature` 不含"账单详情"标题）**：

```json
{
  "id": "wechat-bill-detail",
  "name": "微信·账单详情",
  "packageName": "com.tencent.mm",
  "channel": "accessibility",
  "pageType": "bill-detail",
  "pageSignature": {
    "requireAll": ["支付成功", "支付时间"],
    "requiredLabels": ["支付方式", "交易单号"],
    "timeFormats": ["yyyy年M月d日 HH:mm:ss", "yyyy-MM-dd HH:mm:ss"]
  },
  "fieldAliases": {
    "amountLabel": ["实付金额", "金额"],
    "originalPriceLabel": ["原价"],
    "discountLabel": ["优惠"],
    "occurredAtLabel": ["支付时间", "收款时间", "转账时间"],
    "accountLabel": ["支付方式"],
    "merchantLabel": ["商户全称", "商户"],
    "noteLabel": ["商品", "商户全称"],
    "orderIdLabel": ["交易单号", "商户单号"]
  },
  "noteRule": {
    "preferFields": ["商品", "商户全称"],
    "maxLength": 50,
    "cleanPatterns": ["订单编号\\d+$", "App-\\d+$", "[-–]\\d{6,}$", "-\\d{4,}$"],
    "fallbackToMerchant": true
  },
  "directionRule": {
    "negative": "expense",
    "externalIncomeField": "",
    "selfTransferFields": [],
    "refundFields": ["退款"],
    "default": "confirm"
  },
  "categoryMappings": [
    { "namePattern": "(外卖|牛杂|麻辣烫|奶茶|咖啡|餐饮|餐厅)", "categoryId": "food", "kind": "expense" },
    { "namePattern": "(考试|驾考|车管|财政|非税|罚款)", "categoryId": "utilities", "kind": "expense" },
    { "namePattern": "(超市|生鲜|水果|零食)", "categoryId": "grocery", "kind": "expense" },
    { "namePattern": "(京东|数码|手机|家电)", "categoryId": "shopping", "kind": "expense" }
  ],
  "enabled": true,
  "priority": 200
}
```

> `pageSignature.timeFormats`：微信中文时间 `2026年10月29日 13:24:44` 与支付宝 ISO `2026-10-31 11:03:34` 双格式兼容（§6.3）。

> `categoryMappings` 在详情页规则里**作用于备注 + 商户**（不只是商户，见 §6.5）。`cleanPatterns` 用于清洗备注里的尾缀（如 `燃气费-*贤萍` → `燃气费`）。

### 6.5 备注提取规则

1. 按 `noteRule.preferFields` 优先级遍历 `fieldAliases.noteLabel` 对应标签，取第一个命中的值。
2. 应用 `cleanPatterns` 清洗：去掉户号尾缀、脱敏星号、**订单号尾缀**（`-2610…`、`订单编号\d+`、`App-\d+`）。
3. **无意义降级**：清洗后若结果为空、或纯数字/纯订单号（不含中文字符/字母语义），则回退取下一优先字段，最终降级用 `merchant`（`fallbackToMerchant: true`）。例如微信京东 `京东-订单编号3667…` → 降级"江苏京东信息技术有限公司"。
4. 截断到 `maxLength`（默认 50 字符，避免备注过长）。
5. 备注命中后，同时参与 `categoryMappings` 分类建议（与商户名合并匹配）。

### 6.6 方向判断（核心原则：**以字段结构为准，不以"提现/转账"字样为准**）

**用户核心洞察**：判断一笔钱的业务性质，**看账单详情页的字段名组合**，而不是金额正负、也不是"提现"两个字。

**判定算法**（正/无符号金额时，按字段结构）：

| 字段结构特征 | 含义 | 判定 |
|---|---|---|
| 含 `对方账户`（外部实体，如"外卖名堂"） | 别人/外部公司打款给我 | **income**（收入） |
| 含 `提现到` 或 `收款方式` 或 `处理进度`，且**无** `对方账户` | 自己的账户 → 自己的另一账户 | **transfer**（转账） |
| 含 `退款` 字段 | 退款到账 | **refund**（退款） |
| 微信红包收款子类型（标题含"微信红包-来自"） | 红包收入 | **income** |
| 负金额 | 消费 / 缴费 / 购物 | **expense**（自动） |
| 其他 | 无法判断 | **confirm**（弹确认） |

**实测对照（你的三张图）**：

| 图 | 字段结构 | 判定 |
|---|---|---|
| 图一 外卖名堂 `+28.00` | `对方账户` + `转账备注` + `理由` | income（外部打款） |
| 图二 中信银行 `300.00` | `提现到` + `处理进度` + `提现说明`（**无对方账户**） | transfer（自账户提现） |
| 图三 小荷包 `+925.60` | `收款方式` + `处理进度`（**无对方账户**） | transfer（自账户转出） |

> **口径说明（用户拍板 2026-10-31）**：判断依据是**字段名**。`对方账户` 存在 → 外部打款 = 收入（图一）；`提现到`/`收款方式`/`处理进度` 存在且无 `对方账户` → 自账户划转 = 转账（图二、图三）。**"提现"二字本身不决定性质**——图一的字段名叫"转账备注"、实为收入；图二的"余额提现"才是转账。
>
> ⚠️ **v1 只自动处理负金额（支出）**；所有正金额（含已判 income/transfer/refund 的）一律**弹确认**，不自动落账。负金额也需确认页面是交易完成页（§6.1 签名）。⚠️ 图二 `300.00` **无正负号**，按"收款/到账视角"进入字段结构判定，**不预设为支出**。

---

## 7. 体系二：购物订单体系（美团 / 拼多多 / 京东）

### 7.1 页面特征签名

| 特征 | 京东 | 美团 | 拼多多 |
|---|---|---|---|
| 标题关键词 | `订单详情` | `订单详情` | `订单详情` |
| 必备标签 | `实付款` | `实付款` | `实付款` |
| 商品清单 | 商品名列表 | 商品名列表 | 商品名列表 |
| 时间标签 | `下单时间` | `下单时间` | `下单时间` |

### 7.2 备注素材（购物体系核心价值）

购物订单详情**没有"说明"，但商品名是最丰富的备注来源**：

- 京东：`商品名称`（如"iPhone 16 保护壳"）
- 美团：`商品`（如"麻辣烫套餐""奶茶"）
- 拼多多：`商品`（如"抽纸 24 包"）

备注规则：**取商品清单第一条**（或前 N 条拼接，`maxLength` 内），前缀可带平台名（`外卖-麻辣烫`、`京东-保护壳`）。

### 7.3 关键边界（购物体系专属）

1. **支付渠道**：购物 APP 下单通常跳转支付宝/微信支付，**该笔支出也会出现在支付宝/微信账单里**。所以购物订单详情捕获与支付宝账单详情捕获可能**重复**——必须靠指纹去重（§8）兜住，且**同一笔的指纹在两个体系下应一致**（用"金额+时间+商品/商户"组合，而不是订单号，因为支付宝侧订单号与购物侧订单号不同）。
2. **站内支付**：少数场景用购物 APP 内余额/白条/月付，此时无支付宝/微信账单，订单详情是唯一来源。
3. **商品名做备注**：购物类备注比"支付宝消费"有用得多，这是本体系存在的主要意义。

### 7.4 配置 JSON 示例（京东·订单详情）

```json
{
  "id": "jd-order-detail",
  "name": "京东·订单详情",
  "packageName": "com.jingdong.app.mall",
  "channel": "accessibility",
  "pageType": "order-detail",
  "pageSignature": {
    "requireAll": ["订单详情"],
    "requiredLabels": ["实付款", "下单时间"]
  },
  "fieldAliases": {
    "amountLabel": ["实付款", "实付金额"],
    "occurredAtLabel": ["下单时间", "支付时间"],
    "merchantLabel": ["店铺", "商家"],
    "noteLabel": ["商品", "商品名称", "订单内容"],
    "orderIdLabel": ["订单号"]
  },
  "noteRule": {
    "preferFields": ["商品", "商品名称"],
    "maxLength": 50,
    "prefix": "京东-",
    "joinFirst": 1
  },
  "directionRule": { "negative": "expense", "positiveDefault": "confirm" },
  "categoryMappings": [
    { "namePattern": "(外卖|麻辣烫|奶茶|咖啡|餐饮|餐厅)", "categoryId": "food", "kind": "expense" },
    { "namePattern": "(超市|生鲜|水果|零食)", "categoryId": "grocery", "kind": "expense" },
    { "namePattern": "(数码|手机|电脑|家电|电器)", "categoryId": "shopping", "kind": "expense" },
    { "namePattern": "(医药|药品|口罩|体检)", "categoryId": "health", "kind": "expense" }
  ],
  "enabled": true,
  "priority": 200
}
```

> 美团、拼多多同理，只改 `packageName`、`noteRule.prefix`（`美团-`/`拼多多-`）与 `categoryMappings`。**逻辑不重复写，只配 JSON**。

---

## 8. 指纹去重设计（本次重点）

### 8.1 问题

现 `CaptureDedup` 按 `(包名, 金额, 分钟桶)`，**仅按金额会误杀**（同一天两笔 30 元合法）。且同一笔可能被"支付宝账单详情"和"购物订单详情"双通道各捕获一次。

### 8.2 指纹构成

**优先级从强到弱，取第一个可用**：

```
fingerprint =
  ① sourceOrderId（订单号/户号/交易单号）          —— 最强，跨体系也唯一
  ② hash(amountMinor + occurredAt + merchant)    —— 无订单号时（购物/支付宝双通道共用此键，确保两体系指纹一致）
  ③ hash(amountMinor + occurredAt)               —— 最后兜底
```

> ② 是关键：购物订单详情捕获与支付宝账单详情捕获的是**同一笔钱**，两侧 orderId 不同，但 `(金额 + 时间 + 商户/商品)` 应一致 → 用 ② 保证跨体系去重。

### 8.3 存储

- 新增 Room 表 `capture_fingerprint`：

| 列 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK 自增 | |
| fingerprint | TEXT UNIQUE | 去重键 |
| sourcePackage | TEXT | |
| amountMinor | INTEGER | 金额（分） |
| occurredAt | TEXT | |
| sourceOrderId | TEXT 可空 | |
| status | TEXT | `pending` / `confirmed` |
| createdAt | INTEGER | |

### 8.4 时机

- **查重（写队列前）**：解析成功后，先查 `capture_fingerprint` 是否有相同 fingerprint；命中 → **静默丢弃**，不写队列、不弹窗、不通知。未命中 → 写入队列，并写入一条 `status=pending` 的指纹（防止 500ms 去抖窗口内的重复事件穿透）。
- **确认落账后**：用户保存成功 → 该指纹 `status` 置 `confirmed`（`capture_queue` 的 acknowledge 流程里联动）。
- **拒绝/忽略后**：删除该指纹记录（或置 `status=dismissed`），允许后续重新捕获。

### 8.5 防"用户手动记过"（可选增强，P2）

查重时除 `capture_fingerprint` 外，可再查 `transactions` 表是否存在相同 `(amount_minor, occurred_at, merchant)` 的记录；命中则提示"疑似已记录，是否跳过？"（默认跳过）。**默认关闭**，避免误杀合法重复，作为配置项 `dedupCheckTransactions`。

---

## 9. 数据模型与代码变更清单

### 9.1 原生侧（Android）

| 变更 | 位置 | 说明 | 阶段 |
|---|---|---|---|
| 新增 note 字段 | `CapturedPaymentInfo.java` | `private String note;` + getter/setter | P1-1 |
| 新增 note 列 | `CaptureQueueEntity.java` + Room 迁移 v2→v3 | `capture_queue.note TEXT` | P1-1 |
| 新增指纹表 | `CaptureQueueDatabase.java` + 迁移 | `capture_fingerprint` 表（§8.3） | P1-1 |
| 新增详情页解析器 | `capture/accessibility/rules/DetailPageParser.java`（新增，单文件按体系类型路由） | 按体系类型解析模板，消费 `pageType` 规则 | P1-2 |
| 扩展规则模型 | `RuleBasedParser.java` | 读取 `pageType`/`pageSignature`/`fieldAliases`/`noteRule`/`directionRule`；`pageType` 缺省视为成功页规则（向后兼容） | P1-2 |
| 重做去重 | `CaptureDedup.java` | 改用 fingerprint（§8），废弃 `(包名,金额,分钟桶)` | P1-1 |
| 指纹读写 | `CaptureQueueDao.java` | 新增 fingerprint 表 DAO 方法 | P1-1 |
| 补白名单 | `WhitelistPackages.java` | 加 `PDD = "com.xunmeng.pinduoduo"`（拼多多），ALL/NAMES 同步 | P1-2 |

### 9.2 前端侧（WebView / TypeScript）

| 变更 | 位置 | 说明 | 阶段 |
|---|---|---|---|
| 规则类型扩展 | `capture-rule-config-service.ts` | `CaptureRule` 增加 `pageType?`、`pageSignature?`、`fieldAliases?`、`noteRule?`、`directionRule?`；`version: 2` | P1-4 |
| 默认规则补详情页 | `capture-rule-config-service.ts` | 新增支付宝/微信账单详情 + 京东/美团/拼多多订单详情默认规则（§6.4/§7.4） | P1-4 |
| 解析结果类型扩展 | `payment-capture-reader.ts` | 类型扩展 note / direction / capture 元数据 | P1-4 |
| 备注预填 | `RecordSheet.vue` | 预填 `note`（`route.query.note`）+ 透传 capture 元数据 + 方向提示 | P1-5 |
| 备注传递 | `App.vue` `checkPendingCaptureData` + `PaymentCapturePlugin.getPendingCaptureData` | 读 `pendingCaptureNote` extra，随 query 传给记账页 | P1-5 |
| 领域透传 | `accounting.ts` | `createDraft` / `BaseCommand` 透传 capture 元数据 | P1-5 |
| 服务透传 | `finance-service.ts` | `Create*Input` 接口透传 capture 元数据 | P1-5 |
| 来源落库 | `transaction-repository.ts` | `capture_source`/`parser_version`/`confidence` 不再硬编码 NULL，写入实际值 + 读取映射 | P1-6 |
| 收件箱服务 | `capture-inbox-service.ts` | 用 `event.note` + 透传 | P1-6 |
| 备注展示 | `CaptureInboxView.vue` / `CaptureQuickView.vue` | 捕获事件卡片显示备注 | P1-6 |

> 📌 **各变更项对应的实施子阶段（P1-1 ~ P1-7）见 §12.2**，派活时按文件归属到对应子阶段、各自新开会话。

### 9.3 规则 JSON 版本兼容

- `version` 从 1 → 2。
- 现有规则（无 `pageType`）加载后默认按成功页处理，**不破坏**。
- 前端规则编辑 UI（v1 阶段）可先只读展示详情页规则；编辑功能 P3 再做。

---

## 10. 触发流程与用户路径

### 10.1 典型路径（支付账单体系）

1. 用户支付宝缴费燃气费 → 支付成功页未自动记录（现状漏记）。
2. 用户打开支付宝 → 全部账单 → 找到该笔 → 点进账单详情。
3. 无障碍服务识别"账单详情"页 → 解析 → 指纹查重（首次未命中）→ 写入队列。
4. 拉起记账页，**预填金额 28.00、备注"燃气费"、日期 2026-10-31、分类建议"缴费"**。
5. 用户确认保存 → 落 `transactions`（note 写入、capture_source 写入）→ 指纹置 confirmed。

### 10.2 重复进入同一笔

用户再次点进同一笔详情 → 指纹命中 → **静默丢弃，不弹窗**。

### 10.3 正金额（外部打款 / 自账户划转）

用户点进**图一**（外卖名堂 `+28.00`，含 `对方账户`+`转账备注`）→ 字段结构判为 **income** → 弹确认"外部打款/收入？"，确认后记 income。
用户点进**图二**（中信银行 `300.00`，含 `提现到`、无 `对方账户`）→ 判为 **transfer** → 弹确认"自账户提现/转账？"，确认后记转账。
用户点进**图三**（小荷包 `+925.60`，含 `收款方式`、无 `对方账户`）→ 判为 **transfer** → 弹确认。

---

## 11. 错误处理与边界

| 场景 | 处理 |
|---|---|
| 图片内嵌文字（金额做成图片） | 无障碍读不到 → 该笔无法解析，**静默跳过**（无 OCR，已知边界） |
| 页面动态加载（字段未就绪） | 复用现有 5 次延迟重试（100/300/600/1000/1500ms） |
| 只解析到金额、备注缺失 | 降级记录：金额入账、备注空、`confidence=low`，照常弹窗 |
| 方向不明（正金额且理由无法识别） | 弹确认，不自动落账 |
| 白名单外 APP | 不处理（配置化扩展） |
| 指纹冲突 | 静默丢弃 + 诊断日志（`AccessibilityDiagnostics` 记录 fingerprint 命中） |
| 支付宝/微信页面改版导致标签变化 | 走 `fieldAliases` 配置修正，**不改代码** |

---

## 12. 分期计划与实施拆解

### 12.1 分期总览

| 期 | 范围 | 验收 |
|---|---|---|
| **P1** | 支付宝 + 微信账单详情、备注生成、指纹去重、`capture_source` 落库、白名单补拼多多 | 燃气费/保险/提现三场景实测通过 |
| **P2** | 京东 + 美团 + 拼多多订单详情、跨体系指纹去重 | 外卖/电商下单实测通过 |
| **P3** | 前端规则编辑 UI 支持详情页规则、`dedupCheckTransactions` 可选增强 | 规则可视化编辑可用 |

### 12.2 P1 实施拆解（⚠️ 一个任务 = 一个子阶段，各自新开会话）

> **为什么要拆**：P1 原计划一次性实施，导致单会话上下文膨胀到 ~15 万 token，模型（sensenova-6.8-flash-lite）在超长上下文下会返回**空响应**（`finish_reason=stop`、0 字节、无工具调用），每轮只改 2~3 处就中断，需反复手动"继续"。
>
> **实施规则**：
> 1. **每个子阶段（P1-1 ~ P1-7）单独开一个任务 / 新会话**，做完即收工，不跨阶段继续。
> 2. 子阶段内要求模型**批量合并改动**（一次改多个文件/多处），不要一次只改一处。
> 3. 若某子阶段单次会话未做完、上下文已很大，**不要在原会话点"继续"**，直接新开任务重述剩余范围（新会话上下文干净，能一次跑完）。

| 子阶段 | 范围（按文件） | 可独立验证 | 依赖 |
|---|---|---|---|
| **P1-1** | **原生·数据结构与去重基建**：`CapturedPaymentInfo.java` 加 note/direction；`CaptureQueueEntity.java` 加 note/direction 列；`CaptureQueueDatabase.java` v2→v3 迁移 + 注册；`CaptureFingerprintEntity.java` 新增 + DAO 指纹方法；`CaptureDedup.java` 改造为指纹层 | 原生单测（迁移、去重） | 无 |
| **P1-2** | **原生·详情页解析与规则**：`DetailPageParser.java` 新增（结构化解析）；`RuleBasedParser.java` 扩展 pageType + parseBillDetail + 分类建议合并备注；`CaptureRuleDefaults.java` 补支付宝/微信账单详情默认规则；`WhitelistPackages.java` 补拼多多 | 原生单测 + 真机解析 | P1-1 |
| **P1-3** | **原生·接入与拉起链路**：`PaymentAccessibilityService.java` 接入详情解析 + 指纹查重 + note/direction 落库；`PaymentCapturePlugin.java` 传递 note/direction/capture 元数据 | 真机联调（拉起预填备注） | P1-1、P1-2 |
| **P1-4** | **前端·规则类型与默认规则**：`capture-rule-config-service.ts` 扩展规则类型 + version 2 + 详情页默认规则；`payment-capture-reader.ts` 类型扩展 | 前端单测（规则解析） | P1-2 |
| **P1-5** | **前端·元数据透传**：`App.vue` 传递 note/capture 元数据；`RecordSheet.vue` 预填 note + 透传 + 方向提示；`accounting.ts` 透传 capture 元数据；`finance-service.ts` 透传 capture 元数据 | 前端单测 | P1-3、P1-4 |
| **P1-6** | **前端·落库与展示**：`transaction-repository.ts` 修复 `capture_source` 落库 + 读取映射；`capture-inbox-service.ts` 用 event.note + 透传；`CaptureInboxView.vue` 显示 note/direction | 前端单测 | P1-5 |
| **P1-7** | **验证**：跑前端 + 原生全部单测；真机实测燃气费/保险/提现三场景（§13） | 全部通过 | P1-1~P1-6 |

> ⚠️ P1-2（原生 `CaptureRuleDefaults`）与 P1-4（前端 `capture-rule-config-service`）都涉及"详情页默认规则"，**两份 JSON 规则结构必须保持一致**（同一套 `pageType/pageSignature/fieldAliases/noteRule/directionRule`）。

---

## 13. 验收标准（P1 重点）

1. **燃气费场景**：支付宝账单详情（图3）→ 弹出记账页，金额 `28.00`（**不是 30.00**）、备注"燃气费"、分类"缴费"、日期正确。
2. **保险场景**：支付宝账单详情（图2）→ 金额 `31.55`、备注含"好医保/保费"、分类"保险"。
3. **外部打款（收入）场景**：图一 外卖名堂 `+28.00`（含 `对方账户`+`转账备注`）→ 判为 **income**，弹确认"外部打款/收入？"，确认后记 income。
4. **自账户提现（转账）场景**：图二 中信银行 `300.00`（含 `提现到`、无 `对方账户`）→ 判为 **transfer**，弹确认"自账户提现/转账？"，确认后记转账。
5. **小荷包转出（转账）场景**：图三 小荷包 `+925.60`（含 `收款方式`、无 `对方账户`）→ 判为 **transfer**，弹确认。
6. **微信·美团场景**：微信账单详情（`-16.56`）→ 金额 `16.56`、备注含"三板斧牛杂面"（**订单号尾缀已清洗**）、分类"餐饮"。
7. **微信·非税场景**：微信账单详情（`-259.00`）→ 备注含"汽车驾驶补考科目二"、分类"缴费"。
8. **微信·京东降级场景**：微信账单详情（`-14.99`，商品为纯订单号）→ 备注降级为"江苏京东信息技术有限公司"（非空、无订单号）。
9. **微信·红包收款**：微信红包页（`+2.00`）→ 弹确认提示"红包/收入"，确认后记为 income。
10. **时间双格式**：ISO（`2026-10-31 11:03:34`）与中文（`2026年10月29日 13:24:44`）都能正确解析为 occurredAt。
11. **无符号金额**：图二 `300.00`（无正负号）→ 按字段结构判为 transfer，**不误判为支出**。
12. **重复进入**：同一笔详情二次进入 → 不弹窗（指纹命中）。
13. **备注落库**：保存后 `transactions.note` 非空、`capture_source` 非空（不再为 NULL）。
14. **成功页不回归**：原有支付成功页捕获（如小额扫码）仍正常，且**不误判**账单详情页为成功页（签名校验生效）。
15. **去重不误杀**：同一天两笔 30 元（不同时间）都能记录。

---

## 14. 风险与开放问题

| 风险/问题 | 说明 | 应对 |
|---|---|---|
| 微信账单详情标签 | ✅ 已实测校准（2026-10-31 真机截图：原价/优惠/当前状态/支付时间/商品/商户全称/收单机构/支付方式/交易单号/商户单号） | 无需再校准，`fieldAliases` 已按实测填写 |
| 微信商品字段常为订单号 | 京东微信单 `商品=京东-订单编号3667…`，无真实商品名 | §6.5 无意义降级到商户全称 |
| 时间双格式 | 支付宝 ISO vs 微信中文 `yyyy年M月d日 HH:mm:ss` | §6.3/§6.4 `pageSignature.timeFormats` 双格式兼容 |
| 方向判断原则 | 以**字段结构**为准：`对方账户`→收入；`提现到`/`收款方式`/`处理进度`（无对方账户）→转账；`退款`→退款；不以"提现/转账"字样为准（用户已拍板 2026-10-31） | `directionRule` 已按字段结构填写；图二 `300.00` 无符号需按字段判定 |
| 双通道重复 | 购物订单详情与支付宝账单详情可能捕获同一笔 | §8 指纹键 ② 跨体系一致，兜住 |
| 页面改版频繁 | 支付宝/微信/拼多多 UI 常变 | 全部走 `fieldAliases` 配置，避免硬编码 |
| 备注过度清洗 | `cleanPatterns` 可能误删有效信息 | 清洗规则只作用于已知尾缀，可回退 |

---

## 15. 参考文件

- 无障碍服务主逻辑：`app/android/app/src/main/java/app/financemanager/capture/accessibility/PaymentAccessibilityService.java`
- 规则解析：`.../capture/accessibility/rules/RuleBasedParser.java`、`CaptureRuleDefaults.java`
- 解析结果模型：`.../capture/accessibility/CapturedPaymentInfo.java`
- 去重：`.../capture/accessibility/CaptureDedup.java`
- 白名单：`.../capture/accessibility/WhitelistPackages.java`
- 捕获队列：`.../local/capture/CaptureQueueEntity.java`、`CaptureQueueDao.java`、`CaptureQueueDatabase.java`
- 拉起/预填：`.../local/PaymentCapturePlugin.java`、`.../local/MainActivity.java`
- 前端：`app/src/App.vue`、`components/RecordSheet.vue`、`features/capture-rules/capture-rule-config-service.ts`、`db/repositories/transaction-repository.ts`
- 账本表：`app/src/db/migrations/001_initial_schema.ts`（transactions 含 note/capture_source/parser_version/confidence 列）

---

*（文档结束）*
