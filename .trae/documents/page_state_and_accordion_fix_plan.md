# 页面状态保存 & 折叠卡片多展开修复计划

## Bug 1：页面状态在"右滑回首页→左滑回资产页"后丢失

### 根因
KeepAlive 的缓存 key 为 `cacheEpoch:entryId:routeName`。当用户从首页进入资产页（forward），entryId 为 A；返回首页（back），再进入资产页（新的 forward），entryId 变为 B，导致缓存 miss，页面重新创建。

### 修复方案
修改 `App.vue` 中的 `routeViewKey` 计算属性，不再依赖 entryId。对于单例页面（home、accounts、settings 等），只需要 `cacheEpoch + routeName` 即可唯一标识缓存。entryId 的原始用途是区分同一路由的不同参数版本（如 account-detail?id=1 vs id=2），但 `useRefreshOnActivated` 已经在激活时刷新数据，因此不需要 entryId 参与 key 计算。

### 影响文件
- `app/src/App.vue`（第 22-27 行）

### 修改内容
```ts
// 修改前
const routeViewKey = computed(
  () =>
    `${navigationCacheEpoch.value}:${navigationEntryId.value}:${String(route.name ?? route.path)}`,
)

// 修改后
const routeViewKey = computed(
  () => `${navigationCacheEpoch.value}:${String(route.name ?? route.path)}`,
)
```

---

## Bug 2：折叠卡片只能同时展开一个（手风琴行为）

### 根因
`AccountsView.vue` 使用单个 `ref<AssetSectionId | null>` 存储当前展开的分组 ID，`toggleSection` 每次只能切换一个分组。

### 修复方案
将 `expandedSectionId` 改为数组 `expandedSectionIds`，支持同时展开多个分组。同时修复 `sectionAccounts` 计算属性——之前它基于单一 `expandedSection` 计算，当多个分组展开时会显示错误的账户列表。

### 影响文件
- `app/src/views/AccountsView.vue`

### 修改内容

1. **数据结构**（第 63 行）
```ts
// 修改前
const expandedSectionId = ref<AssetSectionId | null>(null)

// 修改后
const expandedSectionIds = ref<AssetSectionId[]>([])
```

2. **toggleSection 函数**（第 287-289 行）
```ts
// 修改前
function toggleSection(section: AssetSectionSummary): void {
  expandedSectionId.value = expandedSectionId.value === section.id ? null : section.id
}

// 修改后
function toggleSection(section: AssetSectionSummary): void {
  const index = expandedSectionIds.value.indexOf(section.id)
  if (index === -1) {
    expandedSectionIds.value.push(section.id)
  } else {
    expandedSectionIds.value.splice(index, 1)
  }
}
```

3. **expandedSection 计算属性**（第 113-117 行）——移除，不再需要

4. **sectionAccounts 计算属性**（第 106-112 行）——改为接受 section 参数
```ts
// 修改前
const sectionAccounts = computed(() => {
  const types = expandedSection.value?.accountTypes ?? []
  return accounts.value.filter(...)
})

// 修改后（改为普通函数或接受 section 参数的计算）
function getSectionAccounts(section: AssetSectionSummary) {
  return accounts.value.filter(
    (account) =>
      section.accountTypes.includes(account.type) &&
      (showArchivedAccounts.value || !account.archivedAt),
  )
}
```

5. **模板更新**（多处引用）
   - 第 501 行：`'section-card--expanded': expandedSectionId === section.id` → `expandedSectionIds.includes(section.id)`
   - 第 506 行：`:aria-expanded="expandedSectionId === section.id"` → `expandedSectionIds.includes(section.id)`
   - 第 523 行：`v-if="expandedSectionId === section.id"` → `v-if="expandedSectionIds.includes(section.id)"`
   - 第 524 行起：`sectionAccounts` → `getSectionAccounts(section)`

---

## 风险评估

1. **Bug 1 风险**：移除 entryId 后，同一路由的不同参数实例会共享缓存（如从账户 A 详情跳到账户 B 详情）。但 `useRefreshOnActivated` 已在激活时刷新数据，用户只会短暂看到旧数据（约一帧），风险可接受。

2. **Bug 2 风险**：无风险，纯 UI 行为变更。

## 执行步骤

1. 先修复 Bug 2（AccountsView.vue），改动集中在单文件
2. 再修复 Bug 1（App.vue），改动极小
3. 启动开发服务器验证两个修复