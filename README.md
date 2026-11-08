# 私人记账（曾用名：财务经理）

个人本地优先的资产、负债与记账管理工具。

- **平台**：Android（包名 `app.financemanager.local`）
- **当前版本**：`v2.1.0`（versionCode 53）
- **产品定位**：单人、多账本、本地优先、人民币本位币
- **代码仓库**：[Y-Unfettered/finance-manager](https://github.com/Y-Unfettered/finance-manager)

## 功能概览

- **多账本记账**：创建/切换账本，账户与期初余额，资产/负债/应收联动。
- **自动记账**：无障碍服务捕获支付/账单页，当场弹窗（原生悬浮窗）或回 APP 确认入账；规则引擎匹配账户/分类。
- **到期提醒**：信用卡/花呗等还款提醒，按月循环（月末自动取当天），开 APP 首页弹窗、"今日不再提醒"。
- **报表统计**：月报/年报聚合、分类统计。
- **分类体系**：自定义分类、匹配规则、记账页就地展开与排序。
- **模板与周期交易**：常用交易模板、周期交易。
- **备份与恢复**：完整备份/恢复（含 schema 迁移兼容）。

## 技术栈

- **前端**：Vue 3 + TypeScript + Capacitor 8（`app/`）
- **原生**：Android Java（`app/android/`）
- **数据库**：SQLite（Room，迁移管理 + 备份/恢复）

## 本地开发与构建

项目规则（版本策略、目录约定、历史包袱）见 `AGENTS.md`。常用命令：

```bash
# 前端类型检查
cd app && npx vue-tsc --noEmit

# 前端单测
cd app && npx vitest run

# 前端构建 + 同步 Android 资产
cd app && npx vite build && npx cap sync android

# Android debug 构建
cd app/android && ./gradlew assembleDebug

# Android 单测 + 构建
cd app/android && ./gradlew testDebugUnitTest assembleDebug
```

产物：`app/android/app/build/outputs/apk/debug/app-debug.apk`。

## 文档与版本记录

- `docs/当前任务模板.md` — 任务文档模板（任务流程见全局 `~/.zcode/AGENTS.md`）
- `docs/归档/` — 已完成任务归档（沟通、范围、验收、测试清单）
- `docs/开发规范skill与经验库_分享指南.md` — 开发规范 skill 与经验库的位置/分享说明
- `版本记录/` — 每个版本的完整记录（`vX.Y.Z.md`，含功能清单与验证结果）
- `CHANGELOG.md` — 版本变更摘要
- `AGENTS.md` — 项目规则（构建命令、版本策略、历史包袱）

## 版本策略

三位语义（见 `AGENTS.md`）：第一位 = 发布版本，中间位 = 功能版本，最后位 = 补丁。每个版本写 `版本记录/` 并打 git tag；任务归档时提交并推送远端。
