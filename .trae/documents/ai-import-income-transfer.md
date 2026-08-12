# AI 记账：收入识别与内部转账优化

## 摘要

针对两个真实场景优化 AI 记账能力：
1. **各类收入识别**（平台奖励、他人转账、工资到账、投资收益等）→ AI 未正确识别为 income 类型，或误判为 transfer
2. **账户内部转账**（支付宝余额→余额宝自动转入）→ AI 生成的 JSON 粘贴后验证失败

收入场景需覆盖：平台奖励/返现/签到、别人转账/红包、工资/奖金、投资收益、银行卡到账、消费退款。

## 当前状态分析

### 提示词现状（`prompt-template.ts`）

- 6 种交易类型定义完整，但**规则示例太少**，缺乏典型边缘案例
- 转账规则（第73行）仅覆盖"转账/转入/转出/提现/充值"5 个关键词
- 收入规则（第74行）仅覆盖"理财收益到账"
- 没有明确说明"平台奖励/返现/签到收入"的场景处理
- targetAccount 要求"必须从清单选"，当目标账户不在用户账户列表中时 AI 无法填写

### 验证逻辑现状（`import-service.ts`）

- `resolveRow()` 严格匹配 sourceAccount 和 targetAccount 到用户账户列表
- transfer 要求双方账户都存在且不同，否则报错
- 没有降级策略：当 targetAccount 不在清单时直接拒绝，不给 AI 任何容错

### 截图案例分析

**场景 1 - 京东笔笔返现**（收入）：
- 金额 +0.12，说明"笔笔返现-订单返现"，返现至"余额"
- AI 期望：`type=income, sourceAccount=支付宝余额, category=红包/活动奖励`
- 实际：AI 可能错误识别为 transfer 或直接失败

**场景 2 - 淘宝签到提现**（收入）：
- 金额 +0.11，转账备注"淘宝签到提现"，对方账户"淘宝（中国）软件有限公司"
- AI 期望：`type=income, sourceAccount=支付宝余额, category=红包/活动奖励`
- 风险：AI 看到"转账备注"可能误判为 transfer

**场景 3 - 余额→余额宝自动转入**（内部转账）：
- 金额 0.11，付款方式"账户余额"，商品说明"余额宝-自动转入"
- AI 期望：`type=transfer, sourceAccount=支付宝余额, targetAccount=余额宝`
- 风险："余额宝"不在账户清单时，AI 无法填 targetAccount → 验证失败

## 修改方案

### 修改 1：增强提示词规则与示例（`prompt-template.ts`）

**目标**：让 AI 能正确识别收入类型和转账类型，尤其是边缘案例。

具体改动：

**a) 增强收入识别规则**（第70-76行"规则"部分），改为完整的收入场景说明：
```
6. 所有"钱进入你账户"的场景都是 income，包括但不限于：
   ① 平台奖励/返现/签到/红包到账（淘宝签到、京东返现等）
   ② 别人给你转账/发红包（对方账户给你打钱）
   ③ 工资/奖金/劳务报酬/稿费收入
   ④ 投资收益到账（理财收益、股票分红等）
   ⑤ 对方打钱到你的银行卡/支付宝/微信
   ⑥ 消费退款（退到原账户）
   收入进入哪个账户，sourceAccount 就填哪个账户（如"支付宝余额""工商银行卡"）。
   对方是谁/来源是什么，填在 merchant 或 note 中。category 按收入类型选。
   ⚠️ 重要：截图上可能有"转账"字样，但这是别人给你的钱，不是你自己账户互转，
     所以 type 是 income 不是 transfer。只有你自己的两个账户之间互转才是 transfer。
```

**b) 增强转账识别规则**（第73行），补充关键词：
```
3. 标题/说明含"转账/转入/转出/提现/充值/自动转入/余额转入" → 判断是否为 type=transfer：
   - 如果是你自己的账户之间互转（如支付宝余额→余额宝、银行卡→支付宝）→ type=transfer
   - 如果是别人给你转账 → type=income（见规则6）
   - 如果商品说明写"A-自动转入"格式 → sourceAccount 为付款方账户，targetAccount 为 A（如"余额宝"）
   - 如果 targetAccount 不在账户清单中，仍然填写真实名称
   - transfer 必须同时填 sourceAccount 和 targetAccount
```

**c) 新增 5 个示例**（第78-79行"示例"部分），补充到 JSON 数组里：

```json
// 示例 2：平台奖励收入（京东笔笔返现）
{"date":"2026-08-10","time":"10:52","type":"income","amount":"0.12","merchant":"京东支付","note":"笔笔返现-订单返现","sourceAccount":"支付宝余额","targetAccount":"","category":"红包","sourceTransactionId":"202608101052380.12京东支付"}

// 示例 3：内部转账（余额→余额宝）
{"date":"2026-08-12","time":"03:20","type":"transfer","amount":"0.11","merchant":"","note":"余额宝-自动转入","sourceAccount":"支付宝余额","targetAccount":"余额宝","category":"","sourceTransactionId":"202608120320480.11"}

// 示例 4：带对方账户的平台收入（淘宝签到）
{"date":"2026-08-12","time":"01:56","type":"income","amount":"0.11","merchant":"淘宝（中国）软件有限公司","note":"淘宝签到提现","sourceAccount":"支付宝余额","targetAccount":"","category":"红包","sourceTransactionId":"202608120156350.11"}

// 示例 5：别人给你转账（微信/支付宝收钱）
{"date":"2026-08-11","time":"18:30","type":"income","amount":"100.00","merchant":"张三","note":"朋友转账-聚餐AA","sourceAccount":"微信零钱","targetAccount":"","category":"其它","sourceTransactionId":"202608111830100张三"}

// 示例 6：工资到账（银行卡）
{"date":"2026-08-10","time":"09:00","type":"income","amount":"15000.00","merchant":"XX科技有限公司","note":"8月工资","sourceAccount":"工商银行卡","targetAccount":"","category":"工资","sourceTransactionId":"20260810090015000XX科技"}
```

**d) 在示例前加一条提示**：
```
以下示例覆盖常见场景（普通消费、平台奖励收入、内部转账、他人转账、工资到账），请参照格式：
```

### 修改 2：优化转账 targetAccount 不在清单时的容错（`import-service.ts`）

**目标**：当 AI 填写了 targetAccount 但该账户不在用户账户列表时，不直接报错拒绝，而是给出明确的提示让用户知道缺了什么。

具体改动：
- 在 `resolveRow()` 的 targetAccount 匹配逻辑中，当匹配失败时，错误信息从"账户不存在"改为更明确的"目标账户不存在，请先在设置中添加该账户（如：余额宝）"
- 不做自动创建账户（避免数据污染）

### 修改 3（可选）：ImportView 增加更友好的错误提示

当导入失败时，如果是 targetAccount 不在清单的问题，在导入页面的错误提示区显示"缺少账户：XXX，请先在设置中添加"。

## 实现文件清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `app/src/features/import/prompt-template.ts` | 增 | 新增规则说明 + 3 个边缘案例示例 |
| `app/src/features/import/import-service.ts` | 调 | targetAccount 不存在时给出更明确的提示 |

## 验证步骤

1. 构建确认无 TS 错误：`npm run build`
2. 打开 AIPromptView，复制提示词
3. 用三张截图分别测试 AI 识别结果
4. 将 AI 输出的 JSON 粘贴回应用，确认验证通过