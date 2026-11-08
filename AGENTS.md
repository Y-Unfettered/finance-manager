# 财务经理 / 私人记账 — 项目规则

> 工作流程规则见全局指令文件（沟通→文档→开发→打包测试→反馈→归档）：Codex 读 `~/.codex/AGENTS.md`，ZCode 读 `~/.zcode/AGENTS.md`，母本在 `docs/全局工作规则_复制到全局AGENTS.md`。
> 本文件只放**本项目相关**的细节：怎么构建、文档放哪、有哪些历史包袱。
> 每次对话开始时，先读本文件和 `docs/当前任务.md`（若存在），再动手。

## 项目概况
- 应用：私人记账（曾用名"财务经理"），包名 `app.financemanager.local`。
- 技术栈：前端 Vue3 + TypeScript + Capacitor 8（`app/`），Android 原生 Java（`app/android/`）。
- 当前版本：`2.1.0`（versionCode 53），分支 `feature/simplest-capture-record`。

## 版本策略（任务驱动，三位语义）
- 第一位 = 发布版本：真正发布一次 → +1（如 `1.1.0 → 2.1.0`）。
- 中间位 = 功能版本：每完成一个新功能任务 → +1。
- 最后位 = 小版本/补丁：每次修复/小改动 → +1。
- versionCode 严格单调递增（每次 +1，不可回退）。
- 每个版本写 `版本记录/vX.Y.Z.md`；发版可打 git tag `vX.Y.Z`。
- **归档（第 6 步）时**：写文件 + commit + push 到远端；**无远端先提醒用户**，不自作主张。

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
