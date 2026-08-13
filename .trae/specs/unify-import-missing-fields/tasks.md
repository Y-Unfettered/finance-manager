# Tasks

## 阶段一：通用缺失字段机制（数据层）

- [ ] Task 1: 新增 `MissingField` 类型与 `fieldId` 枚举（`import-types.ts`）
  - 新增 `MissingField` interface：`rowIndex`, `fieldId`, `fieldType`, `displayLabel`, `candidates?`, `selectedValue?`
  - 新增 `MissingFieldId` 联合类型：`'date' | 'sourceAccount' | 'targetAccount' | 'category' | 'type' | 'amount'`
  - 新增 `ImportPlan.missingFields: readonly MissingField[]` 字段
  - 保留 `unmatchedAccounts` 和 `unmatchedCategories` 字段（兼容现有代码），后续再移除

- [ ] Task 2: 在 `resolveRow` 后统一收集缺失字段（`import-service.ts`）
  - 在 `previewRows` 中，`validRows` 解析完成后，遍历所有有效行，对每个字段按检测规则表检查
  - 已选择的字段（从 `accountMappings` / `categoryMappings` 传入的）不收集
  - 结果放入 `missingFields` 数组，按 `rowIndex` 排序

- [ ] Task 3: 字段检测规则实现（`import-service.ts`）
  - `date`：`occurredAt` 为 null 或非法时收集
  - `sourceAccount`：非转账行中 `sourceAccountId` 为 null 时收集（candidates = 所有账户）
  - `targetAccount`：转账行中 `targetAccountId` 为 null 时收集（candidates = 所有账户）
  - `category`：`categoryId` 为 null 时收集（candidates = 按 kind 过滤的分类）
  - `type`：`kind` 无法确定时收集（candidates = 收入/支出/转账）
  - `amount`：`amountMinor` 为 null 或 <= 0 时收集（fieldType = 'input'）

## 阶段二：账户ID优先匹配

- [ ] Task 4: 账户 ID 匹配（数据层，`import-service.ts`）
  - 在 `collectPendingAccounts` 中，名称匹配前先检查 `row.sourceAccountId` 是否直接匹配已有账户的 `id`
  - 转账行的 `targetAccountId` 同样优先 ID 匹配
  - ID 匹配失败后，按现有顺序：精确名称→子串→missingFields
  - 更新 `ImportPlan` 中 unmatchedAccounts 收集逻辑，确保 ID 匹配命中的行不再进入

- [ ] Task 5: AI 提示词输出 ID 映射（`prompt-template.ts`）
  - 修改 `generatePromptTemplate`：账户清单中每个账户附带 ID，如 `可用余额 (acc_xxx1)`
  - 输出格式中增加 `accountId` 和 `targetAccountId` 字段说明，要求 AI 输出时填 ID
  - 示例 JSON 中加入 `accountId` / `targetAccountId` 字段
  - 更新 AIPromptView 中传入 `generatePromptTemplate` 的账户数据，包含 `id`

- [ ] Task 6: 余额宝自动转入规则（`import-service.ts`）
  - 在 `resolveRow` 中，检测 `note` 含"余额宝-自动转入"（大小写不敏感）
  - 命中后：`kind = 'transfer'`, `sourceAccountName = '支付宝余额'`, `targetAccountName = '余额宝'`
  - 后续走正常账户匹配流程（ID 优先→名称→子串→missingFields）

## 阶段三：统一缺失字段 UI

- [ ] Task 7: 统一缺失字段 UI 组件（`ImportView.vue`）
  - 移除独立的"缺少账户"和"缺少分类"两套卡片
  - 新增统一的"需要确认的字段"区域，遍历 `missingFields` 渲染
  - `fieldType = 'picker'`：用 VanPicker 选择器
  - `fieldType = 'input'`：用文本输入框
  - 所有字段选择完成后，"导入"按钮激活
  - "重新检查"时：用已选值重新调用 `previewRows`，已选的字段不再出现在 `missingFields` 中，对应卡片自然消失

- [ ] Task 7: 状态管理（`ImportView.vue`）
  - 新增 `missingFieldSelections: Record<string, string>` 状态（key = `rowIndex + '_' + fieldId`）
  - 新增 Picker 组件状态（`showFieldPicker`, `activeFieldKey`, `fieldPickerColumns`）
  - 重新检查时：将已选值转换为 `accountMappings` / `categoryMappings` / 直接注入行数据后重新预览

## 阶段四：验证

- [ ] Task 9: 端到端验证
  - 测试用例1：一笔数据缺少账户和分类，预览显示两个缺失字段卡片，分别选择后重新检查，卡片消失
  - 测试用例2：余额宝自动转入识别
  - 测试用例3：账户 ID 匹配
  - 测试用例4：转入账户缺失走统一机制