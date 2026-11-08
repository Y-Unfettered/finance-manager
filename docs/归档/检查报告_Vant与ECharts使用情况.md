# Vant 4 / ECharts 5 使用情况检查报告

> 检查日期：2026-08-10 ｜ 范围：`app/src`（Vue 3 + Vant 4 + ECharts 5 + Capacitor）
> 对照依据：《技术选型与自动记账方案.md》3.1 / 3.2

## 一、结论摘要

1. **折线图用了 ECharts5，柱状图和环形图没用。** 全项目只有 `app/src/components/AssetTrendChart.vue` 一个文件按需引入了 ECharts（LineChart + CanvasRenderer）。柱状图共 3 处（月度柱状、首页迷你柱状、月报柱状）和环形图 1 处，全部是手写 CSS（`div` + `height%/width%`、`conic-gradient`）。
2. **Vant 4 实际只用了 5 类组件、6 个文件**：Popup、DatePicker、NumberKeyboard、Tab/Tabs、Picker。文档 3.2 规划里的 Calendar、ActionSheet、Dialog、Toast/Notify、SwipeCell、PullRefresh 全部没有落地，是手搓的。
3. 手搓原因分三类：
   - **Vant 根本没有**（图表、金额格式化、品牌图标、页面转场）→ 合理；
   - **Vant 有但交互/视觉不匹配**（带“今天/昨天/前天”快捷的日期选择、PIN 键盘、账户卡片网格、下拉刷新）→ 部分合理；
   - **Vant 有且文档明确规划了但没落地**（Dialog、Toast/Notify、Calendar、SwipeCell、PullRefresh、ActionSheet）→ 属于欠账，最值得补。

## 二、ECharts 5 使用情况（核心问题）

| 图表 | 文件 | 实现 | 是否 ECharts5 |
|---|---|---|---|
| 资产趋势折线图 | `app/src/components/AssetTrendChart.vue` | `echarts/core` LineChart + Grid/Tooltip + CanvasRenderer | ✅ 是 |
| 月度流入/流出柱状图 | `app/src/components/MonthlyBarChart.vue` | `div` + `height%` | ❌ 手写 CSS |
| 首页近 N 天迷你柱状图 | `app/src/components/RecentSummaryCard.vue` | `div` + `height%` | ❌ 手写 CSS |
| 月报/年报柱状图 | `app/src/views/MonthlyReportView.vue` | `div` + `height%`（`barHeight()`） | ❌ 手写 CSS |
| 支出分类环形图 | `app/src/components/DistributionDonut.vue` | CSS `conic-gradient` | ❌ 手写 CSS |
| 分类占比分布条 | `app/src/views/statistics-shared.css` | `div` + `width%` | ❌ 手写 CSS |

- ECharts 全项目仅被 `AssetTrendChart.vue` 引用（`echarts/charts`、`echarts/components`、`echarts/core`、`echarts/renderers`），按需引用了 `LineChart`、`GridComponent`、`TooltipComponent`、`CanvasRenderer`，没有引 `BarChart`/`PieChart`。
- 使用位置：折线图在 `app/src/views/AssetStatisticsView.vue`；柱状图/环形图在 `app/src/views/AccountStatisticsView.vue` 和 `app/src/views/CategoryStatisticsView.vue`。

**为什么这样？**
- 折线图有坐标轴、网格、tooltip、面积渐变、金额缩写（K/M），手搓成本高 → 所以上了 ECharts。
- 柱状图和环形图形态简单，还要做“点击某根柱子/图例筛选”的交互，用 CSS 变量还能直接跟随主题换色；手写 CSS 不用再引 BarChart/PieChart、不用监听 chart 事件，包体也更小。属于“只对最复杂的折线图引了 ECharts”，不是“忘了引”。
- 注意：Vant 里根本没有图表组件，所以图表这块不存在“Vant 替代 ECharts”的问题；问题只是“柱状/环形没走 ECharts”。

## 三、Vant 4 使用现状

### 实际用到 Vant 的地方（仅 6 个文件）

| 文件 | Vant 组件 | 场景 |
|---|---|---|
| `app/src/components/AppBottomSheet.vue` | Popup | 底部弹层基座（自绘头部） |
| `app/src/components/SideDrawer.vue` | Popup | 侧边抽屉（配手写滑动关闭手势） |
| `app/src/components/MonthPickerSheet.vue` | DatePicker | 月份选择 |
| `app/src/components/RecordSheet.vue` | NumberKeyboard | 记账数字键盘 |
| `app/src/views/BillsView.vue` | Tab / Tabs | 日历指标切换 |
| `app/src/views/AssetStatisticsView.vue` | DatePicker / Picker | 区间与期初选择 |

### 文档 3.2 规划了、但实际没有用的

| 规划封装 | 规划方案 | 实际实现 |
|---|---|---|
| `AppCalendarSheet` | Vant Calendar + Popup | `BillsView.vue` 手写日历网格 |
| `AppDialog` | Vant Dialog | 各页手写 `.confirm-dialog` 遮罩、`window.confirm()`、两步删除 |
| `AppToast` / `AppNotify` | Vant Toast / Notify | 无全局提示，全部页面内联 `result-message` 条 |
| `AppActionSheet` | Vant ActionSheet | 未实现 |
| `LedgerSwipeRow` | Vant SwipeCell | 改为长按进入多选 |
| `AppPullRefresh` | Vant PullRefresh | `HomeView.vue` 手写下拉刷新 + 回弹 |
| `AppFilterSheet` | Vant Popup | 只有通用 `AppBottomSheet`，统计筛选仍是原生控件 |
| `AppPeriodPicker` | Vant DatePicker/Picker | ✅ 已落地（MonthPickerSheet / AssetStatisticsView） |
| `MoneyKeyboard` | Vant NumberKeyboard | ✅ 已落地（RecordSheet） |

## 四、手搓（原生实现）清单

### 1. 图表类 —— Vant 无，合理
- `MonthlyBarChart.vue`、`DistributionDonut.vue`、`RecentSummaryCard.vue`、`MonthlyReportView.vue`、`statistics-shared.css`（见第二节）。

### 2. 表单/选择类
| 文件 | 实现 | 判断 |
|---|---|---|
| `app/src/components/DatePicker.vue`（仅 RecordSheet 用） | 原生 `<select>` 年/月/日 + 今天/昨天/前天快捷按钮 | Vant DatePicker 没有快捷按钮，且要塞进键盘弹层，手写基本合理；但项目里 `MonthPickerSheet.vue` 用的是 Vant DatePicker，同一 App 出现两套日期选择，风格不一致 |
| `app/src/components/StatisticsPeriodFilter.vue` | 原生 `<select>` + `<input type="date">` | Vant 有 Picker/DropdownMenu 可替代，但原生控件在 WebView 里弹系统选择器，最简单 |
| `app/src/views/MonthlyReportView.vue` | 原生 `<input type="number">` 选年份 | 同上 |
| `app/src/components/AccountPicker.vue` | Teleport 自绘遮罩 + 原生 `<input>` 搜索 + 账户卡片网格 | Vant Picker 是单列文本列表，放不下“头像+余额”卡片，手写合理 |
| `app/src/components/PinPad.vue` | 自绘 3×4 数字键盘 + 圆点 | Vant 有 NumberKeyboard+PasswordInput，但锁屏页全视觉定制，手写合理 |

### 3. 弹层/反馈类 —— Vant 有且文档规划了，属欠账
- `TransactionDetailSheet.vue`：Vant Popup 基座 + 手写详情 + 手写“两步删除”确认。
- `PayablesView.vue` / `TemplatesView.vue` / `BackupView.vue`：手写 `.confirm-dialog`（`position: fixed` 遮罩）。
- `CategoryManagementView.vue`：直接 `window.confirm()`。
- 全部页面：无 Toast/Notify，成功失败全是页面内联提示条（如 `BackupView.vue` 的 `result-message`）。
- 删除类确认还做了自定义“输入金额验证”交互（`TransactionDetailSheet.vue`），Vant Dialog 表达不了，这部分手写可接受；但普通确认/提示应该统一成组件。

### 4. 导航/布局类 —— 符合“自有视觉封装”策略，合理
- `AppTopBar.vue`：自绘顶栏（文档明确不用 `van-nav-bar`）。
- `AppIconButton.vue`：自绘图标按钮 + 长按提示气泡。
- `SideDrawer.vue`：Vant Popup + 手写滑动关闭手势（Vant Popup 无滑动关闭）。
- `RoutePageFrame.vue`：自绘页面转场、滚动位置恢复、KeepAlive 管理。
- `BaseCard.vue`：自绘卡片（文档明确不用 `van-card`）。
- `App.vue`：自绘 FAB、隐私遮罩、后台锁定逻辑。

### 5. 列表/内容类 —— Vant 无直接对应，合理
- `DailyLedgerCard.vue` / `AccountActivityMonthCard.vue`：自绘流水行，长按多选替代 SwipeCell。
- `MoneyText.vue`：`Intl.NumberFormat` 金额格式化（Vant 无此组件）。
- `CategoryIcon.vue` / `AccountBrandIcon.vue` / `AccountAvatar.vue`：Lucide + `@mdi/js` + 品牌 PNG/SVG 资产（不用 Vant Icon）。

## 五、量化数据

- 原生表单/按钮元素（views + components）：`<button>` 199、`<input>` 90、`<select>` 35、`<textarea>` 7。
- 引用 Vant 的文件：仅 6 个（组件 4 个 + 视图 2 个），且全部是直接 `import { ... } from 'vant'`，没有经过文档规划的 `App*` 封装层。
- 直接使用浏览器/原生 API 约 40+ 处：`Intl`、`ResizeObserver`、`MutationObserver`、`getComputedStyle`、`localStorage`、`window.confirm`、`Teleport` 等。

## 六、风险评估与建议

1. **最值得补：Dialog / Toast 统一封装。** 目前确认弹窗有 4 种写法（`.confirm-dialog`、`window.confirm`、两步删除、内联按钮），提示全无全局组件，样式、动效、焦点管理不统一；文档规划的 `AppDialog`/`AppToast` 没落地。
2. **统一日期选择。** `RecordSheet.vue` 的自写 `DatePicker.vue`（原生 select）与 `MonthPickerSheet.vue` 的 Vant DatePicker 并存，建议二选一：保留快捷按钮，但滚轮换成 Vant DatePicker（项目里已有用法）。
3. **图表可保持现状，但要意识到代价。** CSS 柱状/环形图轻量、主题跟随好；一旦月报要 tooltip、动画、大数据量，三个手写实现（`MonthlyBarChart` / `RecentSummaryCard` / `MonthlyReportView`）是各写各的，建议届时统一引 ECharts `BarChart` + `PieChart` 收敛。
4. **Vant 覆盖度低本身不算 bug。** 按《技术选型》策略是“成熟交互内核 + 自有视觉封装”，但实际规划组件落地约 3/10（只落了 Popup、DatePicker、NumberKeyboard、Tabs），且业务页面直接 `import van`、直接写原生控件，与“只导入 App* 组件”的约束不一致，建议在文档里同步现状或补齐封装。
