# 修复剪贴板导入批次相关问题

## 问题分析

### 问题 1：历史批次导入后剪贴板弹窗重复出现

**现象**：通过剪贴板导入交易后，剪贴板内容仍然保留在系统剪贴板中。当用户再次进入导入页或应用重启后，剪贴板检测再次触发，弹窗再次出现（"弹一下"）。

**根因**：
1. 导入成功后调用 `ClipboardReader.markConsumed()`，但该标记仅存在于原生插件内存中，应用重启后丢失
2. 导入页 `ImportView.vue` 的 `checkPendingClipboard()` 用 `lastClipboardCheckContent` 做去重，但这是模块级变量，组件销毁后丢失
3. 全局 `App.vue` 的 `appStateClipboardProbe()` 用 `lastHandledCandidateText` 做去重，同样是内存变量，应用重启后丢失
4. 系统剪贴板内容未被清除（且不应清除，因为用户可能还有其他用途）

### 问题 2：导入批次 ID 的理解

**用户观察**：同一份数据导入后，批次相关字段的数值相同。用户认为每次导入都应该有不同的值。

**实际情况**：
- 批次 `id`：通过 `crypto.randomUUID()` 生成，每次导入必定不同
- `sourceFingerprint`：通过 `computeBatchFingerprint(fileName, rows)` 计算，是确定性的，相同数据产生相同指纹
- 用户可能将 `sourceFingerprint` 误认为批次 ID，或者看到数据库中的 `sourceFingerprint` 字段认为它是批次标识

**关键发现**：`computeBatchFingerprint` 函数（[import-service.ts](file:///d:/finance-manager/app/src/features/import/import-service.ts#L1074-L1088)）使用文件内容计算指纹，但每次导入都会生成新的批次 `id`。`sourceFingerprint` 仅用于重复检测，不应用作唯一标识。

## 修改方案

### 方案 1：持久化已消费剪贴板指纹，防止重复弹窗

**涉及文件**：
- [App.vue](file:///d:/finance-manager/app/src/App.vue)
- [clipboard-import.ts](file:///d:/finance-manager/app/src/stores/clipboard-import.ts)
- 新增：`clipboard-fingerprint-cache.ts`（工具函数）

**修改内容**：

1. **新增 `clipboard-fingerprint-cache.ts`**：提供 `setConsumedFingerprint(text)` 和 `isConsumedFingerprint(text)` 两个函数，使用 localStorage 存储已消费的剪贴板内容的 MD5（或简单 hash）指纹。设置过期时间（如 24 小时），避免 localStorage 无限增长。

2. **修改 `clipboard-import.ts`**：在 `setCandidate()` 方法中，先调用 `isConsumedFingerprint(text)` 检查，如果已消费过则跳过不弹窗。

3. **修改 `App.vue`**：在 `appStateClipboardProbe()` 和 `clipboardImportCandidate` 监听器中，在调用 `setCandidate` 前先检查指纹缓存。

4. **修改 `ImportView.vue`**：在 `checkPendingClipboard()` 中，导入成功后调用 `setConsumedFingerprint(text)` 记录。

### 方案 2：优化导入批次 ID 的可见性，避免混淆

**涉及文件**：
- [import-service.ts](file:///d:/finance-manager/app/src/features/import/import-service.ts)
- [ImportView.vue](file:///d:/finance-manager/app/src/views/ImportView.vue)

**修改内容**：

1. **修改 `ImportView.vue`**：在"导入完成"页（step === 'done'），当前显示 `result.batchId`（UUID），考虑改为不显示原始批次 ID，或显示更友好的格式（如 `批次 #${shortId}`）。

2. 确认 `sourceFingerprint` 在 UI 中不可见（当前代码已满足，仅 `batchId` 显示在完成页）。

### 方案 3（可选）：撤销后重新导入时，允许选择"覆盖"或"新建"

**不采纳理由**：当前行为已经正确——撤销后 `status = 'void'`，`findActiveByFingerprint` 不会找到已撤销的批次，因此不会阻止重新导入。用户可以直接重新导入，无需额外操作。

## 修改步骤

### Step 1: 创建剪贴板指纹缓存工具

文件：`d:\finance-manager\app\src\features\clipboard\clipboard-fingerprint-cache.ts`

```typescript
/**
 * 使用 localStorage 持久化已消费的剪贴板内容指纹，
 * 防止应用重启后同一剪贴板内容重复触发导入弹窗。
 */

const STORAGE_KEY = 'clipboard_consumed_fingerprints'
const EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 小时

interface FingerprintEntry {
  hash: string
  consumedAt: number
}

function computeSimpleHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16)
}

function loadEntries(): FingerprintEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as FingerprintEntry[]
  } catch {
    return []
  }
}

function saveEntries(entries: FingerprintEntry[]): void {
  // 保存时清理过期条目
  const now = Date.now()
  const valid = entries.filter((e) => now - e.consumedAt < EXPIRY_MS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid))
  } catch {
    // localStorage 满时静默忽略
  }
}

export function isConsumedFingerprint(text: string): boolean {
  const hash = computeSimpleHash(text)
  const entries = loadEntries()
  return entries.some((e) => e.hash === hash)
}

export function setConsumedFingerprint(text: string): void {
  const hash = computeSimpleHash(text)
  const entries = loadEntries()
  // 如果已存在，更新时间戳
  const existing = entries.find((e) => e.hash === hash)
  if (existing) {
    existing.consumedAt = Date.now()
  } else {
    entries.push({ hash, consumedAt: Date.now() })
  }
  saveEntries(entries)
}
```

### Step 2: 修改 `clipboard-import.ts` - 在弹窗前检查指纹缓存

在 `setCandidate()` 方法开头添加指纹检查：

```typescript
import { isConsumedFingerprint } from '@/features/clipboard/clipboard-fingerprint-cache'

setCandidate(text: string, count: number) {
  // 如果已消费过，不再弹窗
  if (isConsumedFingerprint(text)) {
    return
  }
  this.current = { id: nextCandidateId++, text, count }
  this.dialogVisible = true
},
```

### Step 3: 修改 `App.vue` - 在 probe 和 listener 中也检查指纹缓存

在 `appStateClipboardProbe()` 中，找到 `if (!probe.ok) return` 之后，添加：

```typescript
// 检查是否已消费过的指纹
if (isConsumedFingerprint(value)) {
  log.debug('appStateClipboardProbe: 已消费过的指纹 -> 跳过')
  return
}
```

在 `clipboardImportCandidate` 监听器中，找到 `if (!probe.ok)` 之后，同样添加指纹检查。

### Step 4: 修改 `ImportView.vue` - 导入成功后记录指纹

在 `checkPendingClipboard()` 的"情况1"处理中（消费 store 候选项后），在调用 `ClipboardReader.markConsumed()` 后，添加：

```typescript
import { setConsumedFingerprint } from '@/features/clipboard/clipboard-fingerprint-cache'

// 在 ClipboardReader.markConsumed() 之后
setConsumedFingerprint(candidateText)
```

### Step 5: 优化导入完成页的批次 ID 显示

修改 `ImportView.vue` 中"导入完成"页的批次 ID 显示，改为更友好的格式：

```html
<!-- 当前 -->
<p v-if="result?.batchId" class="done-card__batch">批次 ID：{{ result.batchId }}</p>

<!-- 改为 -->
<p v-if="result?.batchId" class="done-card__batch">批次编号：{{ result.batchId.slice(0, 8) }}...</p>
```

## 验证方式

1. 复制 JSON 交易数据到剪贴板
2. 打开应用 → 应弹出剪贴板导入确认弹窗
3. 点击"立即导入" → 完成导入流程
4. 关闭应用（杀死进程）
5. 重新打开应用 → 剪贴板内容相同 → **不应再弹出导入确认弹窗**
6. 复制另一份不同的 JSON → 重新打开应用 → 应弹出导入确认弹窗
7. 撤销已导入的批次 → 重新导入相同数据 → 批次 ID 应不同（新 UUID）