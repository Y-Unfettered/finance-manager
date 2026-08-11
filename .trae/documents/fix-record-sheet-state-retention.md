# 修复记账页面状态保留导致的系列 Bug

## 摘要

记账页面（`NewExpenseView` → `RecordSheet.vue`）因被 `KeepAlive` 缓存，导致再次进入时 `onMounted` 不触发，引发三个相互关联的 bug：表单状态残留、修改变新增、账户余额不同步。修复方案是在 `RecordSheet.vue` 中引入 `onActivated` 钩子，每次页面激活时重置表单状态并重新加载账户余额。

## 当前状态分析

### 问题根因

[App.vue:75-85](file:///d:/finance-manager/app/src/App.vue#L75-L85) 使用 `<KeepAlive :max="32">` 缓存所有路由页面，且 `routeViewKey` 计算方式为：

```ts
// App.vue:25-27
const routeViewKey = computed(
  () => `${navigationCacheEpoch.value}:${String(route.name ?? route.path)}`,
)
```

这个 key **只基于路由名称，不包含 query 参数**。导致：

1. 用户从主页点"+"进入 `/transactions/new`（无 query）→ 记一笔 → `navigateBack` 回主页（页面被缓存，`onUnmounted` 不触发）→ 再次点"+"进入 `/transactions/new`（无 query）→ **routeViewKey 相同 → 复用缓存实例 → `onMounted` 不触发 → 显示上次的状态**

2. 用户长按记录点"修改" → 跳转 `/transactions/new?edit=xxx` → **routeViewKey 仍为 `...:new-expense`（不含 query）→ 复用缓存实例 → `onMounted` 不触发 → `isEditMode` 不被设置 → `loadTransactionForEdit` 不被调用 → 保存时走 create 分支**

3. `loadOptions()`（加载账户余额）只在 `onMounted` 调用一次 → 缓存激活时不重新加载 → 账户余额显示旧值

### 关键代码位置

- **KeepAlive 配置**：[App.vue:75-85](file:///d:/finance-manager/app/src/App.vue#L75-L85)
- **routeViewKey 计算**：[App.vue:25-27](file:///d:/finance-manager/app/src/App.vue#L25-L27)
- **RecordSheet onMounted 初始化**：[RecordSheet.vue:700-756](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L700-L756) — 只在首次挂载时执行
- **loadOptions（加载账户）**：[RecordSheet.vue:238-269](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L238-L269) — 只在 onMounted 调用
- **表单状态变量**：[RecordSheet.vue:75-109](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L75-L109) — amountDisplay、note、isEditMode 等
- **submit 中区分 create/update**：[RecordSheet.vue:565-672](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L565-L672)
- **跳转入口（正确传了 edit 参数）**：
  - [HomeView.vue:391](file:///d:/finance-manager/app/src/views/HomeView.vue#L391) — 长按选择模式下的"修改"
  - [TransactionDetailSheet.vue:116](file:///d:/finance-manager/app/src/components/TransactionDetailSheet.vue#L116) — 详情 sheet 的"修改"按钮

### 已有但未被 RecordSheet 使用的工具

[useRefreshOnActivated.ts](file:///d:/finance-manager/app/src/composables/useRefreshOnActivated.ts) 提供了 `onActivated` 刷新模式（首次激活跳过，后续激活调用 refresh），但 `RecordSheet.vue` 未使用它。其他页面（如 HomeView）使用此 composable 实现"返回时刷新数据"。

## 拟议变更

### 修改文件：`app/src/components/RecordSheet.vue`

**核心思路**：提取表单初始化逻辑为独立函数，在 `onMounted` 和 `onActivated`（非首次）中都调用，确保每次进入记账页面都是干净状态。

#### 变更 1：引入 `onActivated` 并提取初始化函数

在 `<script setup>` 顶部 import 中添加 `onActivated`：

```ts
// RecordSheet.vue:5
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
```

#### 变更 2：新增 `initializeFormState()` 函数

在 `loadTransactionForEdit` 函数之后（约 line 280 附近）新增一个函数，负责重置所有表单状态并按 query 重新初始化。该函数整合了当前 `onMounted` 中 line 701-742 的逻辑（`loadOptions()` + query 处理），并在开头增加"重置表单状态"的步骤：

```ts
let initialActivation = true

async function initializeFormState(): Promise<void> {
  // 重置所有表单状态，避免上次记账残留
  mode.value = 'expense'
  amountDisplay.value = '0'
  amountStarted.value = false
  selectedCategoryId.value = ''
  selectedCategoryName.value = ''
  merchant.value = ''
  note.value = ''
  attachmentDataUris.value = []
  sourceAccountId.value = ''
  targetAccountId.value = ''
  occurredAt.value = ''
  dateLabel.value = '今天'
  discountMode.value = false
  discountAmount.value = ''
  editTransactionId.value = ''
  isEditMode.value = false
  isCopyMode.value = false
  originalOccurredAt.value = ''
  originalRefundTransactionId.value = ''
  errorMessage.value = ''

  await loadOptions()

  const editId = route.query.edit
  const copyId = route.query.copy
  const refundId = route.query.refund
  const requestedMode = route.query.mode
  const requestedAccountId = route.query.accountId
  if (typeof editId === 'string' && editId) {
    editTransactionId.value = editId
    isEditMode.value = true
    await loadTransactionForEdit(editId)
  } else if (typeof copyId === 'string' && copyId) {
    editTransactionId.value = copyId
    isCopyMode.value = true
    await loadTransactionForEdit(copyId)
    amountDisplay.value = '0'
    amountStarted.value = false
    discountAmount.value = ''
    occurredAt.value = new Date().toISOString()
  } else if (typeof refundId === 'string' && refundId) {
    originalRefundTransactionId.value = refundId
    await loadTransactionForEdit(refundId)
    mode.value = 'refund'
    amountDisplay.value = '0'
    amountStarted.value = false
    discountAmount.value = ''
    occurredAt.value = new Date().toISOString()
    attachmentDataUris.value = []
    merchant.value = ''
    note.value = '关联原支出退款'
  } else if (requestedMode === 'repayment') {
    mode.value = 'repayment'
    sourceAccountId.value = debitAccounts.value[0]?.id ?? ''
    targetAccountId.value =
      typeof requestedAccountId === 'string'
        ? requestedAccountId
        : (creditAccounts.value[0]?.id ?? '')
  } else if (
    typeof requestedAccountId === 'string' &&
    activeAccounts.value.some((item) => item.id === requestedAccountId)
  ) {
    sourceAccountId.value = requestedAccountId
  }
}
```

> 说明：query 处理逻辑与原 `onMounted` 中的 line 702-742 完全一致，只是搬进函数并在开头加了状态重置。

#### 变更 3：改造 `onMounted`，调用 `initializeFormState()` 并添加 `onActivated`

将原 `onMounted`（line 700-756）改造为：

```ts
onMounted(async () => {
  await initializeFormState()
  initialActivation = false
  void nextTick(() => {
    preventFrameScroll()
    const frame = pageRef.value?.closest('.route-page-frame') as HTMLElement | null
    if (frame) {
      frameScrollHandler = () => {
        if (frame.scrollTop !== 0 || frame.scrollLeft !== 0) {
          frame.scrollTop = 0
          frame.scrollLeft = 0
        }
      }
      frame.addEventListener('scroll', frameScrollHandler, { passive: true })
    }
  })
})

onActivated(async () => {
  // 首次激活由 onMounted 处理；后续从缓存恢复时重新初始化表单
  if (initialActivation) return
  await initializeFormState()
})
```

> `preventFrameScroll` 相关的滚动锁定逻辑保留在 `onMounted` 中，因为 `pageRef` 对应的 frame 元素在缓存期间不会改变，无需重复绑定。

## 假设与决策

### 决策

1. **不修改 App.vue 的 KeepAlive 配置**：KeepAlive 对其他页面（主页、账户页等保留滚动位置）有意义，不应全局移除。问题仅在 `new-expense` 页面，通过 `onActivated` 在接收端修复更精准。
2. **不修改 routeViewKey 加入 query**：即使加入 query，连续两次新增（都是无 query）仍会复用缓存，无法彻底解决状态保留。`onActivated` 方案能彻底解决。
3. **保留 `rememberLastAccount` 功能**：`resetAccountsForMode` 仍从 localStorage 读取上次选择的账户，只重置表单的金额/备注/模式等，符合用户"不需要状态保留"的诉求（指表单内容，非账户偏好）。
4. **不使用 `useRefreshOnActivated` composable**：该 composable 适合"刷新数据但保留筛选/滚动状态"的场景；RecordSheet 需要"完全重置表单"，语义不同，直接写 `onActivated` 更清晰。

### 假设

- `loadOptions()` 是幂等的，重复调用安全（每次重新加载账户、分类、偏好并重置默认账户）。
- `onActivated` 在 `onMounted` 之后首次触发（Vue 行为），用 `initialActivation` 标志跳过首次避免重复加载。
- `preventFrameScroll` 的 `frameScrollHandler` 在 `onMounted` 绑定一次即可，缓存期间 frame 元素不变。

## 验证步骤

完成后依次验证以下场景（需在真机或模拟器运行 app）：

1. **状态不再残留**：
   - 主页点"+"进入记账 → 输入金额 100、备注"测试"、选择分类 → 保存返回主页
   - 再次点"+"进入记账 → 金额应为 0、备注为空、分类为默认 → ✅ 通过

2. **修改变新增已修复**：
   - 主页长按某条记录 → 点"修改" → 进入记账页面应显示该记录的内容（金额、备注、分类、账户）
   - 修改金额后点"保存修改" → 返回主页确认原记录被更新（非新增） → ✅ 通过
   - 同样验证 TransactionDetailSheet 中点"修改"按钮的场景 → ✅ 通过

3. **复制/退款模式正常**：
   - TransactionDetailSheet 点"复制" → 进入页面金额为 0 但其他字段为原记录内容 → 保存为新记录 → ✅ 通过
   - TransactionDetailSheet 点"退款" → 进入退款模式 → ✅ 通过

4. **账户余额同步**：
   - 记一笔消费（如微信零钱通支出 50）→ 返回主页
   - 再次点"+"进入记账 → 点开"选择支付账户" → 微信零钱通余额应已扣减 50 → ✅ 通过
   - 转账模式下 transfer-card 显示的余额也应同步 → ✅ 通过

5. **金额输入不再出现 06465 异常**：
   - 进入记账页面 → 金额显示 0 → 直接输入 6465 → 应显示 6465（而非 06465） → ✅ 通过
   - 退格删到 0 → 再输入数字 → 应正常显示 → ✅ 通过

6. **其他页面不受影响**：
   - 主页滚动位置、筛选状态在返回时仍保留 → ✅ 通过
   - 账户页、统计页等 KeepAlive 行为正常 → ✅ 通过
