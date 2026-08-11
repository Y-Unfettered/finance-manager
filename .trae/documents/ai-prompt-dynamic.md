# 计划：AI 记账提示词动态生成与嵌入

## 一、需求总结

1. **精炼提示词**：把现有的 `test-json/doubao-prompt.md`（约 3800 字）压缩到 2000 字以内，适配豆包及其他大模型的工具调用字数限制。
2. **动态生成**：提示词不再手写账户和分类列表，改为从 App 本地数据库实时读取当前账户和分类，组装生成。
3. **嵌入设置页**：新增「AI 记账提示词」入口放在设置页，进入后展示动态生成的提示词，支持一键复制。

## 二、当前状态分析

- **提示词文件**：`test-json/doubao-prompt.md`，约 200 行，账户清单（17 个）和分类清单（14 个）硬编码在提示词正文中。
- **数据来源可用**：`finance.listAccounts(ledgerId)` 返回所有账户（含 type/normalBalance，可区分资产/信用）；`finance.listExpenseCategories(ledgerId)` + `listIncomeCategories(ledgerId)` 返回支出/收入分类（含两级 parentId）。
- **设置页**：`SettingsView.vue` 使用 `entries` 数组渲染入口卡片，通过 `router.push({ name })` 跳转，样式有 `.entry-card` 和 `.entry-icon`。
- **复制能力**：可使用 `navigator.clipboard.writeText()`，Android 端已验证可用。

## 三、拟改动清单

### 3.1 新增页面：`AIPromptView.vue`

**路径**：`app/src/views/AIPromptView.vue`

**功能**：
- 页面加载时调用 `finance.listAccounts(ledgerId)` 和 `finance.listExpenseCategories(ledgerId)` + `listIncomeCategories(ledgerId)` 获取实时数据
- 用 `generatePromptTemplate(accounts, expenseCategories, incomeCategories)` 工具函数动态拼装提示词文本
- 页面结构：
  - `AppTopBar` + 标题「AI 记账提示词」
  - 简介区：说明用法（复制 → 粘贴到豆包/AI → 截图记账 → 得到 JSON → 回来导入）
  - **复制按钮**：顶部固定，`navigator.clipboard.writeText()` 后 `showToast` 反馈
  - **提示词展示区**：`<pre>` 标签显示完整文本，`overflow-x: auto`，字号 ~13px，可滚动
  - 字数统计：底部显示当前提示词字数

**核心函数 `generatePromptTemplate`**（可放入 `src/features/import/prompt-template.ts`）：

```
function generatePromptTemplate(accounts, expenseCats, incomeCats) {
  const assetAccounts = accounts.filter(a => a.normalBalance === 'debit' && a.type !== 'credit_card' && a.type !== 'credit')
  const creditAccounts = accounts.filter(a => a.type === 'credit_card' || a.type === 'credit' || a.normalBalance === 'credit')

  按字段模板拼装，压缩措辞，总字数 ≤ 2000

  return 纯文本
}
```

提示词模板字段结构（精简版，目标 ≤ 2000 字）：
- 角色一句话定义
- 输出字段表（仅列必需字段 + 简要说明）
- 6 种 type 速查（一行一个，不做表格）
- **账户清单**（动态，分资产/信用两栏）
- **分类清单**（动态，分支出/收入两栏）
- 5-6 条关键规则（多笔拆分、金额正数、组合支付等）
- 1 个输出示例（最简版，一笔交易即可）

### 3.2 新增工具模块：`src/features/import/prompt-template.ts`

**职责**：
- `generatePromptTemplate(accounts, expenseCats, incomeCats): string` — 核心生成函数
- 账户按 `normalBalance` 分资产/信用两组
- 分类按 kind 分支出/收入两组，二级分类缩进显示
- 返回纯文本字符串

### 3.3 修改路由：`src/router/index.ts`

- 新增路由：
```
{
  path: '/settings/ai-prompt',
  name: 'ai-prompt',
  component: () => import('@/views/AIPromptView.vue'),
}
```
- 保持懒加载

### 3.4 修改设置页：`src/views/SettingsView.vue`

- 在 `entries` 数组中（"导入账单"条目之后或之前）新增一条：
```
{ label: 'AI 记账提示词', description: '复制提示词到豆包/AI，截图生成 JSON', icon: MessageSquare, route: 'ai-prompt' }
```
- 从 `@lucide/vue` 导入 `MessageSquare` 图标
- 同时把现有 `test-json/doubao-prompt.md` 中的硬编码清单删除（因为该文件只作开发参考，不再用于生产）

### 3.5 精简原提示词文档：`test-json/doubao-prompt.md`

- 保留开发参考用途，但压缩账户/分类清单为「以实际数据库为准」的占位符说明
- 或者直接从 App 的提示词页面导出一份示例文本存到该文件（作为开发参考）

## 四、设计决策

1. **提示词生成放在视图层而非单独 store**：数据量小，只在进入页面时加载一次，无需状态管理。
2. **两级分类展示**：一级分类直接列出，二级分类用 `└ 子分类` 缩进格式，让 AI 知道层级关系但不会混淆。
3. **字数控制**：目标 ≤ 2000 字，通过精简措辞（去掉表格改用换行列表、去掉冗余解释、示例简化为单笔）来实现。
4. **复制反馈**：`showToast({ message: '已复制到剪贴板', duration: 2000 })`。

## 五、验证步骤

1. `npm run build` 通过
2. `npm run cap:sync` 部署到 Android
3. 手动验证：
   - 进入设置 → 看到「AI 记账提示词」入口
   - 点入 → 看到提示词，账户/分类与当前数据库一致
   - 点击复制 → Toast 显示，可粘贴验证
   - 修改账户名称后刷新 → 提示词中的账户名随之变化
   - 提示词字数统计显示 ≤ 2000