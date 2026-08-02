# 版本记录制度

## 版本号规则

- `0.0.x`：工程地基和内部开发版本；
- `0.1.0`：第一个完成验收的 MVP；
- `0.x.0`：MVP 后的功能里程碑；
- `x.y.z` 中的 `z`：不改变功能范围的修复和小调整；
- `1.0.0`：达到长期个人生产使用标准。

## 每个版本必须完成

1. 更新 `app/package.json` 的版本号；
2. 更新 Android `versionCode` 和 `versionName`；
3. 更新根目录 `CHANGELOG.md`；
4. 新建独立的 `版本记录/vX.Y.Z.md`；
5. 写明新增、修改、修复、数据迁移和已知限制；
6. 写明实际执行的测试和未能执行的测试；
7. 明确下一版本的目标、范围和不做事项；
8. 确认文档、代码和安装包显示的版本一致。

未满足以上条件的构建不能称为一个已完成版本。

## 发布前固定检查

```text
npm run format:check
npm run lint
npm test
npm run build
npm audit --omit=dev
npx cap sync android
Android Debug/Release 构建（环境具备后）
```

## 模板

新版本复制 [模板.md](模板.md) 后填写，禁止只写“优化体验”或“修复若干问题”等无法核验的描述。

