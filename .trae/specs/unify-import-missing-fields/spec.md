# 导入系统统一缺失字段机制与账户ID匹配 Spec

## Why
当前导入系统每遇到一种缺失字段（账户、分类、转入账户）就单独写一套逻辑，代码冗余且兜底能力差。用户反馈：
1. 缺少账户、分类、转入账户各自处理方式不同，体验不一致
2. "重新检查"后分类选择卡片不消失（看起来像重置），而账户卡片会消失
3. 转入账户缺失只在错误列表里提示"未知"，没有给选择入口
4. 账户匹配只认中文名称，AI命名差异导致匹配不上

根本方案：建立一个**通用的缺失字段检测+选择机制**，任何字段缺失都统一检测、统一展示、统一让用户选择。同时账户匹配增加系统ID优先级。

## What Changes
- **通用缺失字段机制**：任何字段缺失（日期、源账户、转入账户、分类、交易类型、金额）都在 `previewRows` 中统一收集到 `missingFields` 数组，预览 UI 统一渲染选择卡片
- **账户ID优先匹配**：导入数据中的 `sourceAccount` / `targetAccount` 优先按账户 ID（即 `accountId` 字段或名称中的 ID 标识）匹配，名称匹配作为 fallback
- **余额宝自动转入规则**：`note` 含"余额宝-自动转入"时，自动识别为转账类型：源账户=可用余额，转入账户=余额宝
- **重新检查后已选择字段消失**：统一机制下，已确认的选择在重新检查后自然从 `missingFields` 移除，对应卡片消失
- **转入账户选择**：转入账户缺失时走通用缺失字段机制，在预览中提供选择器

## Impact
- Affected specs: fix-import-account-matching（账户匹配增强）
- Affected code: `import-service.ts`, `import-types.ts`, `ImportView.vue`

---

## MODIFIED Requirements

### Requirement: 通用缺失字段检测机制
系统在 `previewRows` 中 SHALL 对每一行遍历所有关键字段，任何字段缺失或无效时统一收集到 `missingFields` 数组。不再为每种字段单独写分支。

`missingFields` 结构：
```
[
  {
    rowIndex: number,           // 行号（1-based）
    fieldId: 'date' | 'sourceAccount' | 'targetAccount' | 'category' | 'type' | 'amount',
    fieldType: 'picker' | 'input',  // picker=下拉选择, input=直接输入
    displayLabel: string,       // 显示给用户的标签，如 "第1行·缺少收入分类"
    candidates?: Array<{ id: string; name: string }>,  // picker 候选列表
    selectedValue?: string,     // 用户已选择的值（ID 或文本）
  }
]
```

系统 SHALL 支持以下字段缺失检测：

#### 字段检测规则表
| 字段 | fieldId | 缺失条件 | fieldType | candidates 来源 |
|------|---------|---------|-----------|----------------|
| 日期 | `date` | `row.date` 为 null/undefined 或非法 | `input` | 无（用户输入） |
| 源账户 | `sourceAccount` | 账户匹配后 `row.accountId` 仍为 null | `picker` | 所有已有账户 |
| 转入账户 | `targetAccount` | 转账类型且 `row.targetAccountId` 为 null | `picker` | 所有已有账户 |
| 分类 | `category` | `row.categoryId` 为 null | `picker` | 按 type 过滤后的分类（收入/支出） |
| 交易类型 | `type` | `row.type` 为 null（无法判定收入/支出/转账） | `picker` | `[收入, 支出, 转账]` |
| 金额 | `amount` | `row.amount` 为 null 或 <= 0 | `input` | 无（用户输入） |

#### Scenario: 多个字段同时缺失
- **GIVEN** 一行数据同时缺少账户和分类
- **WHEN** 用户进入预览
- **THEN** `missingFields` 中有两条记录（同一行的账户和分类各一条），预览中显示两个选择卡片
- **AND** 用户分别选择后点击"重新检查"，两条记录都被移除，卡片消失

#### Scenario: 重新检查后已选择字段自然消失
- **GIVEN** 用户已为第1行选择了一个分类
- **WHEN** 用户点击"重新检查"
- **THEN** 新计划中该字段的 `selectedValue` 保留，`previewRows` 检测到已选中，不再将此行列入 `missingFields`
- **AND** 对应的 UI 选择卡片消失

### Requirement: 账户ID匹配（端到端机制）

系统在匹配账户时 SHALL 使用端到端的 ID 机制，按以下顺序匹配：

1. **ID 精确匹配**：导入数据中的 `accountId` 字段（或 `sourceAccount` / `targetAccount` 中含账户 ID 的字符串）与已有账户的 `id` 精确匹配
2. **精确名称匹配**：账户名完全相同（fallback）
3. **子串匹配**：双向包含且唯一（fallback，沿用已有逻辑）
4. **全部失败**：加入 `missingFields` 由用户选择

该 ID 机制包含三个环节：

#### 环节一：账户 ID 稳定性（已有，无需改动）
账户创建时通过 `ids.next('account')` 生成唯一 ID，ID 永不变更。账户改名不影响 ID。

#### 环节二：AI 提示词输出 ID 映射
AI 提示词生成时 SHALL 在账户清单中附带每个账户的 ID：
```
资产：
- 可用余额 (acc_xxx1)
- 余额宝 (acc_xxx2)
信用：
- 花呗 (acc_xxx3)
```

提示词输出格式中 SHALL 要求 AI 在 JSON 中包含 `accountId` 字段（源账户和转入账户各一个），值为上述清单中的 ID。名称字段（`sourceAccount` / `targetAccount`）同时保留作为兜底显示。

示例输出：
```json
{"date":"2026-08-12","type":"transfer","amount":"0.11",
 "accountId":"acc_xxx1","targetAccountId":"acc_xxx2",
 "sourceAccount":"可用余额","targetAccount":"余额宝",
 "note":"余额宝-自动转入"}
```

#### 环节三：导入时按 ID 精确匹配
`previewRows` / `resolveRow` 中 SHALL 优先使用 `accountId` 和 `targetAccountId` 字段做 ID 精确匹配。匹配成功后，`sourceAccount` / `targetAccount` 名称字段作为显示用，不参与匹配。

#### Scenario: AI 输出 ID，导入精确匹配
- **GIVEN** 用户账户"可用余额"的 ID 为 `acc_xxx1`
- **WHEN** AI 输出 `{"accountId":"acc_xxx1","sourceAccount":"可用余额"...}`
- **THEN** 导入时按 `acc_xxx1` 精确匹配到该账户，无论用户之后把名字改成什么

#### Scenario: ID 匹配失败后回退名称
- **GIVEN** 已有账户"可用余额"，ID 为 `acc_xxx1`
- **WHEN** 导入数据中 `sourceAccount: "可用余额"` 但无 `accountId` 字段
- **THEN** 走名称匹配（精确→子串→missingFields）

#### Scenario: 账户改名后 AI 提示词同步更新
- **GIVEN** 用户将"可用余额"改名为"小金库"
- **WHEN** 用户打开 AI 提示词页面
- **THEN** 提示词中显示 `小金库 (acc_xxx1)`，AI 输出的 ID 不变，导入正常匹配

### Requirement: 余额宝自动转入识别规则
系统 SHALL 在解析行时检测以下规则，命中后自动填充字段：

当 `note`（或 `memo`）字段包含 "余额宝-自动转入"（大小写不敏感），系统 SHALL 将其识别为**转账**类型：
- `type = 'transfer'`
- `sourceAccount = '支付宝余额'`
- `targetAccount = '余额宝'`

若用户已有这两个名称的账户，则自动匹配。若无，则走通用缺失字段机制。

#### Scenario: 余额宝自动转入
- **GIVEN** 用户有"支付宝余额"和"余额宝"两个账户
- **WHEN** 导入数据中 `note: "余额宝-自动转入"`
- **THEN** 系统自动识别为转账：源账户=支付宝余额，转入账户=余额宝，无需用户干预

### Requirement: 统一缺失字段 UI
系统 SHALL 在预览步骤中渲染一个统一的"缺失字段"区域，替代现有的独立"缺少账户"、"缺少分类"卡片：

- 标题："以下字段需要确认"（或 "Missing Fields"）
- 每条 `missingField` 渲染为一个卡片：
  - 显示 `displayLabel`（如 "第1行·缺少收入分类"）
  - `fieldType = 'picker'`：VanPicker / 下拉选择器
  - `fieldType = 'input'`：文本输入框
- 所有字段选择完成后，"导入"按钮才激活
- "重新检查"按钮触发：用用户已选的值重新调用 `previewRows`，未缺失的字段不再出现在 `missingFields` 中

#### Scenario: 所有字段已选则无修正区域
- **GIVEN** 所有字段都已自动匹配或用户已选择
- **WHEN** 用户进入预览
- **THEN** 不显示"缺失字段"区域，只显示交易预览和统计

## REMOVED Requirements

### Requirement: 独立的 `unmatchedAccounts` 和 `unmatchedCategories` 两套逻辑
**Reason**: 两套逻辑本质相同，维护两套代码导致体验不一致（重新检查后一个消失、一个不消失）
**Migration**: 合并为统一的 `missingFields` 数组，所有字段缺失走同一套检测和选择流程

## Non-Goals (本版本不做)
- 多语言 i18n
- 导入历史对比
- 导入数据预览的编辑（行删除/修改仅通过缺失字段修正）