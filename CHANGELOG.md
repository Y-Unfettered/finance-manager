# 更新日志

本项目采用语义化版本号。每个版本除本文件的摘要外，还必须在 `版本记录` 目录保留完整记录，包含本次更新、调整、验证结果、已知问题和下一版本计划。

## [0.0.2] - 2026-08-03

### 新增

- 接入 `@capacitor-community/sqlite` 8.1.0，并同步到 Android 原生工程。
- 新增 SQLite schema v1：账本、账户、分类、交易、分录和 migration 记录表。
- 新增账户余额、交易借贷平衡视图，以及索引、外键、金额和账户方向约束。
- 新增原子 migration runner，支持重复启动、失败回滚和未知高版本拒绝降级。
- 新增账户类型、正常余额方向、整数分金额和交易分录领域类型。
- 实现支出、收入、账户转账和信用消费四类复式分录规则。
- Android 启动时初始化数据库；组件基线页显示 SQLite 状态与 schema 版本。
- 新增基于真实 SQLite 引擎的 schema/migration 集成测试。

### 调整

- 前端版本更新为 `0.0.2`，Android 更新为 `versionCode 2 / versionName 0.0.2`。
- 本地工程迁移到纯英文路径 `D:\finance-manager`，避免 Android/Gradle 工具链处理中文路径时出现资源合并异常。

### 验证

- 4 个测试文件、21 个测试用例全部通过。
- 格式、Lint、TypeScript、Web 生产构建和 Android Debug 构建全部通过。
- 生产依赖安全审计为 0 个已知漏洞。

### 下一版本

- `0.0.3`：Repository 持久化层、账本/账户/分类初始化服务、交易与分录原子写入和余额查询测试。

完整记录：[版本记录/v0.0.2.md](版本记录/v0.0.2.md)

## [0.0.1] - 2026-08-03

### 新增

- Vue 3 + TypeScript + Vite + Capacitor Android 工程基线。
- UI V3 Design Token 和第一批复用组件。
- Pinia、Vue Router、Vant Popup 与 Lucide 图标接入。
- Vitest、Vue Test Utils、ESLint、Prettier 和生产构建脚本。
- 开发组件基线页。
- 版本记录制度与发布检查清单。
- 首个可安装的 Android Debug APK。

### 调整

- Vant 样式改为按组件引入，减少无用 CSS。
- Android `versionName` 与前端版本统一为 `0.0.1`。
- 增加 Windows 中文项目路径的 Android Gradle 兼容设置。

### 下一版本

- `0.0.2`：SQLite 接入、schema v1、migration runner、账务领域类型与第一组分录规则测试。

完整记录：[版本记录/v0.0.1.md](版本记录/v0.0.1.md)
