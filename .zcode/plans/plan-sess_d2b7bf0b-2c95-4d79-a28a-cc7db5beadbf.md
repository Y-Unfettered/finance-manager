## 修复：转账缺少转出/转入账户时转为缺失字段（而非阻塞报错）

**修改文件**：`app/src/features/import/import-service.ts` → `resolveRow` 函数的 transfer 分支

**具体改动**：

1. 当 `row.sourceAccountName` 为 `undefined`（JSON 没有 sourceAccount 字段）时，添加 `else` 分支，设置 `__missing_source_N__` 占位符
2. 当 `row.targetAccountName` 为 `undefined`（JSON 没有 targetAccount 字段）时，添加 `else` 分支，设置 `__missing_target_N__` 占位符
3. 删除已失效的 `if (!sourceAccountId || !targetAccountId)` 错误检查（占位符已赋值，不会为 true）
4. 保留 `sourceAccountId === targetAccountId` 检查（合法业务规则）

**已验证的完整性**：
- `missingFields` 收集器已识别 `__missing_source_N__` / `__missing_target_N__`
- `applyUnmatchedAndRePreview` 已处理 targetAccount 的用户选择
- `executeImport` 的 accountIdMap 已支持 `__missing_target_N__` 前缀解析
- "重新检查"后用户选择的账户 ID 可通过 `accountMap.get(missingKey)` 返回真实 ID