<p align="center">
  <img src="app/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" width="80" alt="私人记账图标">
</p>

<h1 align="center">私人记账</h1>

<p align="center">个人本地优先的资产、负债与记账管理工具（曾用名：财务经理）</p>

<p align="center">
  <img src="https://img.shields.io/badge/版本-v2.1.0-blue?logo=android&logoColor=white" alt="版本">
  <img src="https://img.shields.io/badge/平台-Android-green?logo=android&logoColor=white" alt="平台">
  <img src="https://img.shields.io/badge/前端-Vue3%20%2B%20TypeScript-42b883?logo=vuedotjs&logoColor=white" alt="前端">
  <img src="https://img.shields.io/badge/许可-CC--BY--NC--SA--4.0-orange" alt="许可">
</p>

---

## 这是什么

私人记账（曾用名：财务经理）是一个**个人本地优先**的资产、负债与记账管理工具。单人使用、多账本、数据保存在本地、人民币本位币。

- 包名：`app.financemanager.local`
- 代码仓库：[Y-Unfettered/finance-manager](https://github.com/Y-Unfettered/finance-manager)

## 为什么做

记账数据不想上云、想自己掌控；手动记账繁琐、想自动捕获；资产/负债/应收要能联动。因此做一个**本地优先、自动记账**的个人记账工具。

## 功能

- ✅ **多账本记账**：创建/切换账本，账户与期初余额，资产/负债/应收联动
- 🔄 **自动记账**：无障碍服务捕获支付/账单页，当场弹窗（原生悬浮窗）或回 APP 确认入账，规则引擎匹配账户/分类
- 🔔 **到期提醒**：信用卡/花呗等还款提醒，按月循环（月末自动取当天），开 APP 首页弹窗、"今日不再提醒"
- 📊 **报表统计**：月报/年报聚合、分类统计
- 🗂️ **分类体系**：自定义分类、匹配规则、记账页就地展开与排序
- 📋 **模板与周期交易**：常用交易模板、周期交易
- 💾 **备份与恢复**：完整备份/恢复（含 schema 迁移兼容）

## 环境要求

- **Android 设备**：Android 7.0（API 24）及以上
- **本地开发**：Node.js 18+、JDK 17+、Android SDK（API 34+）、Gradle 8.x

## 快速开始

```bash
# 克隆
git clone git@github.com:Y-Unfettered/finance-manager.git
cd finance-manager

# 安装前端依赖
cd app && npm install

# 构建 debug APK
cd android && ./gradlew assembleDebug
```

产物：`app/android/app/build/outputs/apk/debug/app-debug.apk`

## 常用命令

项目规则（版本策略、目录约定、历史包袱）见 [`AGENTS.md`](AGENTS.md)。

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

## 架构

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Capacitor 8（`app/`） |
| 原生 | Android Java（`app/android/`）：无障碍服务、原生悬浮窗、通知监听 |
| 数据库 | SQLite（Room，迁移管理 + 备份/恢复） |

自动记账链路：无障碍服务捕获账单 → 规则引擎匹配账户/分类 → 悬浮窗/回 APP 确认入账 → 单事务原子提交 → 余额读时聚合。

## 隐私与安全

- **本地优先**：数据存于设备本地 SQLite，**不上云**。
- **无障碍服务**：仅用于识别支付/账单页以自动记账；服务类名伪装成系统组件（P1-1 渠道决策未定，影响上架）。
- **备份/恢复**：本地文件导出/导入；`schema_migrations` 不参与恢复，迁移加列需同步备份表结构。
- **金额**：一律整数分（`amount_minor`），核心记账单事务原子提交。

## 文档

| 文档 | 说明 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 项目规则（构建命令、版本策略、历史包袱） |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本变更摘要 |
| [`docs/当前任务模板.md`](docs/当前任务模板.md) | 任务文档模板 |
| [`docs/归档/`](docs/归档/) | 已完成任务归档 |
| [`docs/开发规范skill与经验库_分享指南.md`](docs/开发规范skill与经验库_分享指南.md) | 开发规范 skill 与经验库位置/分享 |
| [`版本记录/`](版本记录/) | 每个版本的完整记录 |

## 版本策略

三位语义（见 `AGENTS.md`）：第一位 = 发布版本，中间位 = 功能版本，最后位 = 补丁。每个版本写 `版本记录/` 并打 git tag；任务归档时提交并推送远端。

## 许可

本项目采用 [CC BY-NC-SA 4.0](LICENSE)（署名-非商业性使用-相同方式共享）：允许分享与改编，**禁止商用**；改编须相同方式共享。详见 `LICENSE`。
