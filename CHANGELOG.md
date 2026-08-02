# 更新日志

本项目采用语义化版本号。每个版本除本文件的摘要外，还必须在 `版本记录` 目录保留完整记录，包含本次更新、调整、验证结果、已知问题和下一版本计划。

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
