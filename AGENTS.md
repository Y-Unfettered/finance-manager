# 财务经理 / 私人记账 — 项目规则

> 工作流程规则见全局 `~/.codex/AGENTS.md`（沟通→文档→开发→打包测试→反馈→归档）。
> 本文件只放**本项目相关**的细节：怎么构建、文档放哪、有哪些历史包袱。
> 每次对话开始时，先读本文件和 `docs/当前任务.md`（若存在），再动手。

## 项目概况
- 应用：私人记账（曾用名"财务经理"），包名 `app.financemanager.local`。
- 技术栈：前端 Vue3 + TypeScript + Capacitor 8（`app/`），Android 原生 Java（`app/android/`）。
- 当前版本：`1.1.0`（versionCode 52），分支 `feature/simplest-capture-record`。

## 目录约定
- `docs/` — 所有文档。`docs/当前任务.md` 是当前任务活文档，`docs/归档/` 存已完成的任务。
- `docs/当前任务模板.md` — 新建当前任务文档时复制此模板。
- `版本记录/` — 历史版本记录（发版时补齐对应版本号文件）。

## 常用命令（在 `app/` 目录下）
- 前端类型检查：`npx vue-tsc --noEmit`
- 前端单测：`npx vitest run`
- 前端构建：`npx vite build`
- Android debug 构建：`cd app/android && ./gradlew assembleDebug`（产物 `app/android/app/build/outputs/apk/debug/app-debug.apk`）
- Android 单测 + 构建：`cd app/android && ./gradlew testDebugUnitTest assembleDebug`
- release（未签名，不能直接装）：`./gradlew assembleRelease`

## 发布 / 实测注意
- 历史从未产出签名 release，`app-release-unsigned.apk` 无法直接安装。
- 实测请用 debug 包。**注意确认包的构建时间**——构建产物不会自动包含最新未构建的代码改动。
- 打包后给用户的测试清单应覆盖：改动涉及的界面、以及自动记账链路（捕获→确认入账→备份/恢复）。

## 已知历史包袱（避免踩坑）
- 自动记账的 `confirmEvent` 依赖 `window.__financeService` 全局实例，**非 setup 上下文不要用 `inject()`**。
- 无障碍服务类名伪装成系统 `SelectToSpeak`（P1-1 渠道决策未定，影响能否上 Google Play）。
- 金额一律整数分（`amount_minor`），核心记账在单事务内原子提交，余额走读时聚合视图。
- 备份/恢复：`schema_migrations` 不参与恢复，新增迁移加列时需同步 `backup-repository` 的 `TABLE_SCHEMAS`。

## 沟通语言
用中文。
