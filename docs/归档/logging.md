# 诊断日志系统说明

## 概述

应用内置了一套分级诊断日志系统，记录关键业务操作的执行轨迹、异常和边界情况。日志可在「设置 → 诊断日志」页面查看、筛选、导出和分享。

## 日志级别

| 级别 | 含义 | 记录场景 |
|------|------|----------|
| `debug` | 详细调试信息 | 方法入口、中间状态、参数快照 |
| `info` | 正常业务结果 | 操作成功、导入完成、同步结果 |
| `warn` | 边界/异常但不中断 | 数据验证失败、部分行错误、跳过重复 |
| `error` | 错误/异常 | 方法抛出异常、导入失败、存储错误 |

## 日志标签（tag）

按功能模块分类，便于筛选定位问题：

| Tag | 模块 | 说明 |
|-----|------|------|
| `finance` | 记账 | 收入/支出/转账/信用卡等记录操作 |
| `import` | 导入 | CSV 解析、预览、账户匹配、执行导入 |
| `ledger` | 账本 | 账本创建、切换、初始化 |
| `budget` | 预算 | 预算设置、修改、删除 |
| `clipboard` | 剪贴板 | 外部数据探测、内容解析、确认流程 |
| `nav` | 导航 | 页面切换（如有） |
| `app-lock` | 应用锁 | 锁屏/解锁 |

## 模式与配置

### 两种模式

| 模式 | 说明 | 配置值 |
|------|------|--------|
| **开发模式** | 全开：debug/info/warn/error 全部记录 | `globalMinLevel: 'debug'`，`maxEntries: 2000` |
| **正式版** | 仅记录 warn/error | `globalMinLevel: 'warn'`，`maxEntries: 500` |

两种模式可在诊断日志页面顶部一键切换。配置持久化到 `localStorage`，重启不丢失。

### 配置项

```typescript
interface LogConfig {
  enabled: boolean                    // 日志系统总开关
  maxEntries: number                   // 最大条目数（超出后裁剪最旧记录）
  globalMinLevel: LogLevel             // 全局最小级别过滤
  tagMinLevels: Record<string, LogLevel | null>  // 按 tag 的独立级别覆盖
}
```

`tagMinLevels` 优先级最高：
- `tagMinLevels['finance'] = 'debug'` → finance 模块记录 debug 及以上
- `tagMinLevels['nav'] = null` → 完全关闭 nav 模块
- 未配置的 tag 使用 `globalMinLevel`

### 通过 store 修改配置

```typescript
const logStore = useAppLogStore()

// 切换到开发模式（全开）
logStore.setDevMode()

// 切换到正式版（仅 warn/error）
logStore.setProductionMode()

// 自定义配置
logStore.setConfig({
  globalMinLevel: 'info',
  tagMinLevels: {
    finance: 'debug',   // finance 模块开放 debug
    nav: null,          // 关闭 nav
  },
})
```

## 使用方式

### 在 Vue 组件中

```typescript
import { useAppLogStore } from '@/features/debug/app-logger'

const logStore = useAppLogStore()
logStore.debug('finance', 'createExpense: start', { accountId, amountMinor })
logStore.info('finance', 'createExpense: success', { id: record.id })
logStore.warn('finance', 'createExpense: duplicate', { name, amount })
logStore.error('finance', 'createExpense: failed', { error: e.message })
```

### 在纯 TS 文件（service 层）

```typescript
import { getLogger } from '@/features/debug/app-logger'

const log = getLogger('finance')

log.debug('createExpense: start', { accountId, amountMinor })
log.info('createExpense: success', { id: record.id })
log.warn('createExpense: duplicate', { name })
log.error('createExpense: failed', { error: e.message })
```

### 日志调用规范

1. **debug**：放在方法入口，记录关键参数快照
2. **info**：放在方法成功返回前，记录结果
3. **warn**：放在数据验证失败、边界条件触发时
4. **error**：放在 catch 块中，记录异常消息和相关上下文

不记录：
- 密码、密钥、token 等敏感数据
- 高频循环中的逐条记录（只记汇总）
- 无信息量的日志（如"方法执行中"但无上下文）

## 查看、导出与分享

打开「设置 → 诊断日志」页面：

- **总览**：按级别统计条目数
- **筛选**：按级别、tag、关键词过滤
- **清空**：清空所有日志（有确认弹窗）
- **导出 JSON**：导出到文件（Android/iOS 写入 Download 目录，Web 端触发下载）
- **分享**：调用手机系统分享面板，可直接分享飞书/微信等

## 正式版本发布前检查清单

发布正式版本前建议逐一确认：

- [ ] 已切换到正式版模式（`setProductionMode`），仅保留 warn/error
- [ ] `maxEntries` 设置为 500，避免存储膨胀
- [ ] 不需要的模块（如 `nav`）在 `tagMinLevels` 中设为 `null`
- [ ] 确认没有 debug 级别的日志被误写为 info 级别
- [ ] 确认 error 日志不包含敏感数据
- [ ] 确认分享/导出功能在目标平台正常（Android/iOS/Web）