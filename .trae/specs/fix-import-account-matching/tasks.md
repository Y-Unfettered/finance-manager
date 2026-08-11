# Tasks

- [x] Task 1: 实现账户名智能匹配（`import-service.ts` + `import-types.ts`）
  - [x] 在 `collectPendingAccounts` 中，精确匹配失败后新增子串匹配逻辑
  - [x] 子串匹配：双向检查 `rawName` 是否包含已有账户名，或已有账户名是否包含 `rawName`
  - [x] 匹配唯一时自动采用，不唯一时收集到 `unmatchedAccounts` 中
  - [x] 在 `ImportPlan` 中新增 `unmatchedAccounts: Array<{ rawName: string; role: 'source' | 'target'; candidates: Array<{ accountId: string; accountName: string }> }>`
  - [x] 子串匹配结果也通过 `accountMappings` 的方式注入到 `accountMap`，让 `resolveRow` 能正确解析

- [x] Task 2: 指纹从阻断改为警告（`import-service.ts`）
  - [x] 修改 `executeImport`：移除 `checkBatchDuplicate` 阻断逻辑
  - [x] 在 `previewRows` 中检测重复指纹，设置 `ImportPlan.duplicateWarning`
  - [x] `ImportPlan` 新增 `duplicateWarning?: string`

- [x] Task 3: 简化导入流程，预览阶段直接修正未匹配项（`ImportView.vue`）
  - [x] 去掉独立的"映射"步骤（`step === 'mapping'`），文件选择后直接进入预览
  - [x] 保留字段映射功能，但改为自动检测；仅当自动检测失败时在预览中显示字段调整入口
  - [x] 在预览步骤顶部展示"未匹配的账户"区域：每个未匹配账户显示"'XX'没有找到，请选择：" + 下拉列表 + "创建新账户"按钮
  - [x] 用户修改后点击"重新检查"按钮，调用 `previewRows` 重新解析
  - [x] 在预览步骤展示 `duplicateWarning` 警告（如有）
  - [x] 更新步骤指示器为 3 步：选择 → 预览 → 完成

- [x] Task 4: 修复批次记录显示（`import-service.ts` + `ImportBatchesView.vue`）
  - [x] `listBatchesWithSummary` 中 catch 不再吞错，保留批次记录
  - [x] `ImportBatchesView.vue` 中批次列表按 status 分组：活跃在前，已撤销在后
  - [x] 确保 executionErrors 和 preflightErrors 都正确展示

# Task Dependencies
- Task 2 依赖 Task 1（指纹警告是辅助手段，智能匹配是核心）
- Task 3 依赖 Task 1 和 Task 2（UI 需要 `unmatchedAccounts` 和 `duplicateWarning` 字段）
- Task 4 可独立并行执行