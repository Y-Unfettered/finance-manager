# 导入相关问题分析与修复计划

## 一、问题 1：重复导入

### 当前状态分析

**问题表现：**
1. 导入 JSON 后返回，再次弹出导入提示
2. 同一份 JSON 数据可以多次导入，交易会重复增加

**代码分析：**

**剪贴板指纹缓存机制** (`clipboard-fingerprint-cache.ts`)：
- 已存在 `isConsumedFingerprint` / `setConsumedFingerprint` 机制，通过 localStorage 持久化剪贴板内容哈希，24 小时过期
- `App.vue` 的 `appStateClipboardProbe` 和 `clipboardCandidateListener` 都会检查该指纹

**但存在两个漏洞：**

**漏洞 A：导入完成后指纹未及时生效导致重复弹窗**
- 导入成功后 `setConsumedFingerprint` 只在 `ImportView.vue` 的 `confirmImport` (line 674) 和 `checkPendingClipboard` (line 486) 中调用
- 当用户从"完成"页返回，`onActivated` 触发 `checkPendingClipboard` 重新检查剪贴板内容
- 指纹虽已记录，但 `appStateClipboardProbe` 在 `App.vue` 的 `onResume` 中触发，可能早于 `setConsumedFingerprint` 的执行时机

**漏洞 B：批次级重复导入无拦截**
- `import-service.ts` 中 `checkBatchDuplicate` 方法存在（line 329-332），但从未在 UI 流程中调用
- `executeImport` (line 334) 不检查 `sourceFingerprint` 是否已有活跃批次
- `previewRows` (line 230-234) 只是显示警告 `该文件似乎已经导入过...是否继续？`，但不阻止导入
- 因此同一批数据可以反复导入，产生多份重复交易

### 修复方案

#### 1.1 导入完成后标记剪贴板指纹更早/更可靠

**文件：** `d:\finance-manager\app\src\components\ClipboardImportDialog.vue`
- 用户点击「立即导入」时，在 `store.confirm()` 之后立即调用 `setConsumedFingerprint(store.current.text)`，而不是等到 ImportView 加载后再标记

**文件：** `d:\finance-manager\app\src\views\ImportView.vue`
- `confirmImport` 成功后，在当前 `setConsumedFingerprint(pasteText.value)` 的基础上，确保 `pasteText.value` 在导入全流程中均被设置

#### 1.2 批次级重复导入拦截（核心修复）

**文件：** `d:\finance-manager\app\src\features\import\import-service.ts`

在 `executeImport` 方法开头增加主动检查：

```typescript
// 检查该文件指纹是否已有活跃的导入批次
const existingBatch = await this.batches.findActiveByFingerprint(ledgerId, plan.sourceFingerprint)
if (existingBatch) {
  throw new Error(
    `该数据已在此前导入过（批次：${existingBatch.fileName ?? '未知'}，` +
    `导入时间：${existingBatch.createdAt}），不允许重复导入。` +
    `如需重新导入，请先撤销旧的导入批次。`
  )
}
```

**文件：** `d:\finance-manager\app\src\views\ImportView.vue`

在 `confirmImport` 中捕获该错误并显示给用户。

#### 1.3 可选：预览页增加重复导入警告且阻止确认按钮

**文件：** `d:\finance-manager\app\src\views\ImportView.vue`

预览步骤中，如果 `plan.value?.duplicateWarning` 存在，禁用「确认导入」按钮并显示红字提示，要求用户先撤销旧批次。

---

## 二、问题 2：历史批次与撤销逻辑

### 当前实现

**历史批次** (`ImportBatchesView.vue`)：
- 展示所有导入批次记录，按 `active`（有效）和 `void`（已撤销）分组
- 每个批次显示：文件名、来源、导入时间、统计数据（总行数/成功/失败/重复）
- 展开后可查看该批次导入的每笔交易明细

**撤销批次** (`import-batch-repository.ts` 的 `voidBatch` 方法，line 271-289)：
- 并非只是状态标记！它会**实际变更数据**：
  1. 将该批次关联的所有交易的 `status` 从 `'posted'` 改为 `'void'`（作废）
  2. 将批次自身的 `status` 改为 `'void'`，记录 `voided_at` 时间
- 撤销后，这些交易在账单/报表中不再计入统计（因 `status = 'void'`）
- 操作不可逆

**所以：** "撤销此批次" = 作废该批次导入的全部交易 + 标记批次已撤销。不是简单的状态标记。

---

## 三、问题 3：CREDIT-PURCHASE 显示

### 含义

`credit_purchase` 是**信用卡消费**交易类型。当从信用卡/负债账户进行消费时，系统自动使用此类型：

- 在 `import-service.ts` (line 613-626)：当导入的支出行使用的账户是信用卡（`normalBalance === 'credit'`）时，自动创建 `credit_purchase` 类型交易而非普通 `expense`
- 在其他视图中的显示：
  - `AccountDetailView.vue`：映射为「信用消费」
  - `BillsView.vue`：映射为「信用消费」
  - `TransactionSearchView.vue`：映射为「信用卡消费」

**ImportBatchesView.vue 的 `typeLabel` 缺少映射：**

`ImportBatchesView.vue` (line 161-174) 的 `typeLabel` 函数中，缺少 `credit_purchase` 的映射：

```typescript
function typeLabel(type: string): string {
  const map: Record<string, string> = {
    expense: '支出',
    income: '收入',
    transfer: '转账',
    repayment: '还款',
    loan_out: '借出',
    loan_recovery: '收款',
    refund: '退款',
    borrowing: '借入',
    repay_borrowing: '归还',
    // 缺少 credit_purchase: '信用消费'
  }
  return map[type] ?? type  // 所以未匹配时直接显示原始类型名
}
```

因此你看到的 `CREDIT-PURCHASE` 实际上是 `credit_purchase` 的原始值，因为缺少中文映射。

### 修复

**文件：** `d:\finance-manager\app\src\views\ImportBatchesView.vue`

在 `typeLabel` 的 `map` 中添加：`credit_purchase: '信用消费'`

---

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `src/features/import/import-service.ts` | `executeImport` 开头增加 `findActiveByFingerprint` 检查，发现重复时抛错 |
| `src/views/ImportView.vue` | 捕获 `executeImport` 的重复错误并显示；预览页禁用导入按钮当有 `duplicateWarning` |
| `src/components/ClipboardImportDialog.vue` | 点击「立即导入」时立即标记指纹已消费 |
| `src/views/ImportBatchesView.vue` | `typeLabel` 添加 `credit_purchase: '信用消费'` |

## 验证步骤

1. 复制一份 JSON → 进入 APP → 导入成功
2. 返回首页 → 确认不再弹出导入提示
3. 再次复制同一份 JSON → 进入 APP → 确认不再弹出导入提示
4. 进入导入页（手动粘贴同一份 JSON）→ 预览页应提示重复并阻止导入
5. 检查导入批次页 → 交易明细中的 `credit_purchase` 应显示为「信用消费」