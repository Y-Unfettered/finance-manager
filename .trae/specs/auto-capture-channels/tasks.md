# Tasks

- [ ] Task 1: 搭建 Android 原生基础设施（Room 捕获队列 + Capacitor 插件骨架）
  - [ ] SubTask 1.1: 在 `app/android` 中添加 Room 依赖（build.gradle）
  - [ ] SubTask 1.2: 创建 `CaptureQueueDatabase` 和 `CaptureQueueDao`（Room 数据库和 DAO）
  - [ ] SubTask 1.3: 创建 `CaptureQueueEntity` 数据实体类（对应 spec 表结构）
  - [ ] SubTask 1.4: 创建 `PaymentCapturePlugin`（Capacitor 本地插件骨架，注册到 patch-capacitor-plugins.mjs）
  - [ ] SubTask 1.5: 暴露插件接口：`getServiceHealth()`、`listPendingEvents()`、`acknowledgeEvents()`、`openAccessibilitySettings()`、`openNotificationAccessSettings()`

- [ ] Task 2: 实现无障碍服务（AccessibilityService）
  - [ ] SubTask 2.1: 创建 `PaymentAccessibilityService` 类，继承 `AccessibilityService`
  - [ ] SubTask 2.2: 创建 `res/xml/accessibility_config.xml` 配置文件（声明窗口事件类型、事件类型等）
  - [ ] SubTask 2.3: 在 AndroidManifest.xml 中注册服务并声明 `BIND_ACCESSIBILITY_SERVICE` 权限
  - [ ] SubTask 2.4: 实现白名单包名常量（微信、支付宝、京东、美团、抖音）
  - [ ] SubTask 2.5: 实现 `onAccessibilityEvent()` 中的窗口变化检测逻辑（包名过滤 + Activity 切换检测）
  - [ ] SubTask 2.6: 实现 `extractPaymentFromNode()` 方法：遍历可见 AccessibilityNodeInfo，提取金额/商户/时间
  - [ ] SubTask 2.7: 实现支付宝支付成功页适配器（正则/关键词匹配提取字段）
  - [ ] SubTask 2.8: 实现微信支付成功页适配器
  - [ ] SubTask 2.9: 实现金额去重逻辑（同来源 + 同金额 + 1 分钟内合并）
  - [ ] SubTask 2.10: 将解析结果写入 Room 捕获队列

- [ ] Task 3: 实现通知监听服务（NotificationListenerService）
  - [ ] SubTask 3.1: 创建 `PaymentNotificationListenerService` 类
  - [ ] SubTask 3.2: 在 AndroidManifest.xml 中注册服务并声明 `BIND_NOTIFICATION_LISTENER_SERVICE` 权限
  - [ ] SubTask 3.3: 实现 `onNotificationPosted()` 中的白名单过滤和通知文本解析
  - [ ] SubTask 3.4: 实现支付宝/微信通知文本适配器
  - [ ] SubTask 3.5: 将解析结果写入 Room 捕获队列

- [ ] Task 4: 实现分享接收 + 本地 OCR
  - [ ] SubTask 4.1: 添加 ML Kit Text Recognition 依赖（build.gradle）
  - [ ] SubTask 4.2: 创建 `PaymentShareActivity`，注册 `ACTION_SEND` intent-filter（text/plain + image/*）
  - [ ] SubTask 4.3: 实现文本分享处理（直接提取金额/商户/时间关键字段）
  - [ ] SubTask 4.4: 实现图片 OCR 处理（ML Kit `TextRecognition` → 提取文本 → 解析关键字段）
  - [ ] SubTask 4.5: 实现 OCR 结果指纹去重
  - [ ] SubTask 4.6: OCR 完成后释放图片资源

- [ ] SubTask 4.7: 统一支付解析器 Registry（`SourceAdapterRegistry`）
  - [ ] 按包名路由到对应适配器
  - [ ] 定义 `CapturedPayment` 数据模型（对应 spec 中 CapturedPayment 接口）

- [ ] Task 5: 实现前端「待确认账单」页面
  - [ ] SubTask 5.1: 创建 `CaptureInboxRepository`（SQLite 表 + 仓储）
  - [ ] SubTask 5.2: 创建数据库 migration（新增 `capture_queue` 表）
  - [ ] SubTask 5.3: 创建 `features/capture-inbox/capture-inbox-service.ts`（确认/忽略/编辑逻辑）
  - [ ] SubTask 5.4: 创建 `CaptureInboxView.vue`（待确认账单页面，列表展示 + 操作按钮）
  - [ ] SubTask 5.5: 实现确认入账流程（调用现有 finance-service 入账）
  - [ ] SubTask 5.6: 实现去重检测（金额+时间+商户指纹比对）
  - [ ] SubTask 5.7: 添加路由配置

- [ ] Task 6: 实现前端「自动记账设置」页面
  - [ ] SubTask 6.1: 创建 `features/capture-settings/` 模块
  - [ ] SubTask 6.2: 在 SettingsView.vue 中添加「自动记账」入口
  - [ ] SubTask 6.3: 创建 `CaptureSettingsView.vue` 页面
  - [ ] SubTask 6.4: 实现无障碍服务状态显示 + 跳转设置
  - [ ] SubTask 6.5: 实现通知监听状态显示 + 跳转设置
  - [ ] SubTask 6.6: 实现服务健康状态显示（最近捕获时间、来源、解析器版本）
  - [ ] SubTask 6.7: 实现白名单 APP 开关列表

- [ ] Task 7: 前端原生事件监听集成
  - [ ] SubTask 7.1: 创建 `features/capture-inbox/capture-reader.ts`（原生插件 TypeScript 接口封装）
  - [ ] SubTask 7.2: 在 App.vue 中监听 `paymentCaptured` 原生事件（与现有 `clipboardImportCandidate` 同模式）
  - [ ] SubTask 7.3: 事件到达时更新待确认账单状态并显示通知角标

- [ ] Task 8: 集成验证与文档
  - [ ] SubTask 8.1: 更新 `patch-capacitor-plugins.mjs`，注册新插件
  - [ ] SubTask 8.2: 编写版本记录（`版本记录/v0.5.0.md`）
  - [ ] SubTask 8.3: 更新 `技术选型与自动记账方案.md` 中阶段 C 的状态

# Task Dependencies

- Task 2 依赖 Task 1（无障碍服务需要 Room 队列和插件骨架）
- Task 3 依赖 Task 1（通知监听需要 Room 队列）
- Task 4 依赖 Task 1（分享+OCR 需要 Room 队列和 Registry）
- Task 5 依赖 Task 1（待确认账单需要插件接口读取队列数据）
- Task 6 依赖 Task 2、Task 3（设置页需要读取服务状态）
- Task 7 依赖 Task 1、Task 5（事件监听需要插件和数据模型就绪）
- Task 8 依赖所有其他任务