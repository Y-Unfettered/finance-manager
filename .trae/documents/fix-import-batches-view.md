# 修复导入批次查看功能

## 用户反馈的三个问题（根因已确认）

### 问题 1：入口位置不合理
查看批次入口当前在 ImportView 第 4 步"完成"页面里（[ImportView.vue:1048](file:///d:/finance-manager/app/src/views/ImportView.vue#L1048)），用户必须走完整个导入流程才能进入。需要在第 1 步"选择"页面就提供入口。

### 问题 2：显示"乱码"——真正根因是 SQL 列名错误 + 错误信息直接显示给用户

**根因**：[import-batch-repository.ts](file:///d:/finance-manager/app/src/db/repositories/import-batch-repository.ts) 中的 `BATCH_TRANSACTION_SELECT` SQL 引用了 `entries.normal_balance` 列，但该列**不存在**。

- `entries` 表的列是 `side`（'debit'/'credit'），见 [001_initial_schema.ts:79](file:///d:/finance-manager/app/src/db/migrations/001_initial_schema.ts#L79)
- `normal_balance` 是 `accounts` 表的列，见 [001_initial_schema.ts:24](file:///d:/finance-manager/app/src/db/migrations/001_initial_schema.ts#L24)
- 正确写法见 [transaction-repository.ts:530](file:///d:/finance-manager/app/src/db/repositories/transaction-repository.ts#L530)：`entries.side = 'credit'`

**用户看到的"乱码"是**：SQLite 抛出的错误信息 `no such column: entries.normal_balance (code 1): , while compiling: SELECT ...`，包含完整 SQL。这个错误通过 `getBatchDetail` 的 try/catch 被存入 `detailError`，然后在 [ImportBatchesView.vue:274](file:///d:/finance-manager/app/src/views/ImportBatchesView.vue#L274) 直接 `{{ detailError }}` 显示给用户。

**所以"乱码"不是 UUID**（之前误判），而是 SQL 报错信息。修复 SQL 列名后，错误信息自然消失，用户就能看到正常的交易列表。

**额外问题**：即便 SQL 修好，错误信息也不应直接显示原始 SQLite 报错给用户。应显示友好提示（如"读取明细失败，请重试"），原始错误只记入日志。

### 问题 3：布局错位
虽然根因（SQL 错误）修复后不会再有超长错误字符串，但为了防御性，仍需给所有可能包含长文本的容器加 `min-width: 0`，长文本元素加 `overflow-wrap: anywhere`。

## 额外发现的根因问题

**批次卡片本身（折叠状态）只显示 `fileName`**，而所有剪贴板导入的批次 `fileName` 都是 `"剪贴板导入.json"`（[ImportView.vue:333/374/419/453](file:///d:/finance-manager/app/src/views/ImportView.vue#L333)），用户根本分不清哪个批次是哪个。卡片上应该直接显示该批次的交易摘要（如"龙江鸡猪脚饭"），让用户不展开就能识别。

## 改动方案

### 改动 1（最高优先级）：修复 SQL 列名错误

**文件**：[d:\finance-manager\app\src\db\repositories\import-batch-repository.ts](file:///d:/finance-manager/app/src/db/repositories/import-batch-repository.ts)

**位置**：`BATCH_TRANSACTION_SELECT` 常量（约第 98-129 行）

**修改**：
- `entries.normal_balance = 'debit'` → `entries.side = 'credit'`（sourceAccountName，贷方=资金流出方）
- `entries.normal_balance = 'credit'` → `entries.side = 'debit'`（targetAccountName，借方=资金流入方）

**注意方向**：参考 [transaction-repository.ts:529-535](file:///d:/finance-manager/app/src/db/repositories/transaction-repository.ts#L529-L535)：
- `entries.side = 'credit'` → sourceAccountName（来源/转出账户）
- `entries.side = 'debit'` → targetAccountName（目标/转入账户）

我之前不仅列名写错，方向也写反了，一并修正。

### 改动 2：错误信息友好化

**文件**：[d:\finance-manager\app\src\views\ImportBatchesView.vue](file:///d:/finance-manager/app/src/views/ImportBatchesView.vue)

**位置**：[第 274 行](file:///d:/finance-manager/app/src/views/ImportBatchesView.vue#L274) `{{ detailError }}`

**修改**：不再直接显示原始错误，改为友好提示：
```vue
<div v-else-if="detailError" class="batch-detail__error">
  读取明细失败，请关闭后重试。如问题持续，请导出诊断日志排查。
</div>
```

原始错误用 `console.error` 记录到控制台（诊断日志系统会捕获）。

### 改动 3：ImportView.vue 第 1 步加"查看批次"入口

**文件**：[d:\finance-manager\app\src\views\ImportView.vue](file:///d:/finance-manager/app/src/views/ImportView.vue)

**位置**：第 1 步 `step === 'select'` 区块末尾，约第 782 行 `errorMessage` div 之后、`</template>` 之前。

**新增**：一个"查看历史批次"按钮，点击调用已有的 `goToBatches()`（[ImportView.vue:654](file:///d:/finance-manager/app/src/views/ImportView.vue#L654) 已实现 `router.push({ name: 'import-batches' })`）。

**样式**：用独立卡片包裹，带 `ListChecks` 图标和 `ChevronRight` 箭头，与"选择文件""粘贴"按钮视觉区分，避免误点。

**HTML 结构**：
```vue
<BaseCard class="history-entry-card">
  <button type="button" class="history-entry-card__btn" @click="goToBatches">
    <ListChecks :size="18" :stroke-width="1.75" />
    <span>查看历史批次</span>
    <ChevronRight :size="16" :stroke-width="1.75" class="history-entry-card__chev" />
  </button>
</BaseCard>
```

**script 调整**：从 `@lucide/vue` 的 import 列表增加 `ListChecks`（`ChevronRight` 已 import）。

### 改动 4：批次卡片折叠状态显示交易摘要

**目标**：让用户不展开卡片就能识别批次内容，例如"龙江鸡猪脚饭、美团订单、微信支付等 5 笔"。

**Service 层**：[d:\finance-manager\app\src\features\import\import-service.ts](file:///d:/finance-manager/app/src/features/import/import-service.ts)

新增 `listBatchesWithSummary(ledgerId)` 方法，返回 `Array<{ batch: ImportBatchRecord; summary: string }>`。实现：先 `listByLedger`，再对每个批次 `listBatchActivity` 取前 3 笔 posted 交易的 merchant（优先）/ counterparty / note，用 `、` 连接，超过 3 笔追加 `等 N 笔`。N+1 查询，批次通常 < 20 个，性能可接受。

**前端**：[d:\finance-manager\app\src\views\ImportBatchesView.vue](file:///d:/finance-manager/app/src/views/ImportBatchesView.vue)

把 `batches` 从 `ImportBatchRecord[]` 改成 `Array<{ batch: ImportBatchRecord; summary: string }>`，在卡片头部 `batch.fileName` 下方新增一行显示 summary。

```vue
<div class="batch-card__title">
  <strong>{{ batch.fileName ?? '未知来源' }}</strong>
  <small>{{ sourceLabel(batch.source) }} · {{ formatDateTime(batch.createdAt) }}</small>
  <small v-if="summary" class="batch-card__summary">{{ summary }}</small>
</div>
```

### 改动 5：失败明细去掉 UUID，显示交易摘要

**文件**：[d:\finance-manager\app\src\views\ImportBatchesView.vue](file:///d:/finance-manager/app/src/views/ImportBatchesView.vue)

**删除**：[第 334-337 行](file:///d:/finance-manager/app/src/views/ImportBatchesView.vue#L334-L337) 的 `流水号：{{ err.row.sourceTransactionId as string }}` 整块。

**新增**：在 `err-list__head` 和 `err-list__meta` 之间，显示该失败行的交易摘要（merchant / counterparty / note）。`getBatchDetail` 已把 `failedValidRows` 快照存进 `executionErrors[i].row`（[import-service.ts:489-492](file:///d:/finance-manager/app/src/features/import/import-service.ts#L489-L492)），可直接读取。

```vue
<div v-if="failedRowLabel(err.row)" class="err-list__row-label">
  {{ failedRowLabel(err.row) }}
</div>
```

新增 `failedRowLabel(row)` helper：优先返回 `merchant`，其次 `counterparty`，最后 `note`；都没有返回空字符串（不渲染）。

### 改动 6：修复布局错位（CSS 防御性加固）

**文件**：[d:\finance-manager\app\src\views\ImportBatchesView.vue](file:///d:/finance-manager/app/src/views/ImportBatchesView.vue) 的 `<style scoped>`

**根因**：长字符串（错误信息、长备注）作为 flex/grid item 不换行，撑爆容器。

**修复**：
1. `.batches-page__content`：加 `min-width: 0`
2. `.batch-card`：加 `min-width: 0`
3. `.batch-detail`：加 `min-width: 0`
4. `.err-list__item`：加 `min-width: 0`
5. `.err-list__message`：加 `overflow-wrap: anywhere`
6. `.err-list__row-label`（新增）：`overflow-wrap: anywhere; word-break: break-all;`
7. `.batch-card__summary`（新增）：`overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
8. `.txn-list__counterparty`：已有 ellipsis，保留

## 验证步骤

1. **SQL 修复测试**：进入批次列表，展开任意批次，**不再出现 SQL 错误信息**，正常显示交易列表
2. **入口测试**：进入"导入账单"页面，第 1 步即可看到"查看历史批次"按钮，点击跳转到批次列表
3. **摘要测试**：批次卡片应显示交易摘要（如"龙江鸡猪脚饭、美团订单等 5 笔"），而非只显示"剪贴板导入.json"
4. **失败明细测试**：展开失败批次，失败行显示商户名（如"龙江鸡猪脚饭"），**不再显示 UUID 或 SQL 报错**
5. **布局测试**：展开任意批次，卡片宽度保持在屏幕内，不超出
6. **错误处理测试**：模拟 getBatchDetail 失败，应显示"读取明细失败，请关闭后重试"，而非原始 SQL 错误
7. **回归测试**：
   - `npm run test` 全部通过
   - `npm run lint` 无错误
   - `npx vue-tsc --noEmit` 无类型错误
   - `npm run build` 成功

## 假设与决策

- **根因修正**：之前误判"乱码"是 UUID，实际是 SQL 错误信息。修复 SQL 列名是最高优先级。
- **假设**：批次数量通常 < 20，N+1 查询性能可接受。
- **决策**：完全去掉 `sourceTransactionId` 显示（用户明确说不需要乱码）。字段仍保留在数据库，仅 UI 不展示。
- **决策**：错误信息不直接显示给用户，改用友好提示 + 控制台日志。
- **决策**：摘要取前 3 笔交易的 merchant，用 `、` 连接。3 是平衡信息量和宽度的合理值。
- **决策**：入口按钮用独立卡片包裹，与"选择文件""粘贴"按钮视觉区分。
- **不改动**：`executionErrorsJson` 存储结构不变。
