# 首页调整计划

## 一、现状分析

### 1. 预算进度条

**当前实现方式：手搓 CSS**
- [HomeView.vue#L580-L582](file:///d:/finance-manager/app/src/views/HomeView.vue#L580-L582)：`<span>` + 内联 `width` 百分比
- CSS 在 [HomeView.vue#L957-L971](file:///d:/finance-manager/app/src/views/HomeView.vue#L957-L971)：`.budget-card__track` + 内部 span 宽度动画
- 逻辑在 [HomeView.vue#L130-L142](file:///d:/finance-manager/app/src/views/HomeView.vue#L130-L142)：`percent = (spent / total) * 100`，从 0% 往上涨

**问题：**
- 进度条从 0 往上涨，不符合直觉
- 没有使用 Vant 组件
- 缺少中间颜色（绿→琥珀→红）过渡

### 2. 最近汇总柱状图

**当前实现方式：手搓 CSS**
- [RecentSummaryCard.vue](file:///d:/finance-manager/app/src/components/RecentSummaryCard.vue)：`<i>` + 内联 `height` 百分比
- 纯 CSS 柱条，未使用 echarts

### 3. BudgetView 圆环

**当前实现：** conic-gradient 手搓圆环
- [BudgetView.vue#L190](file:///d:/finance-manager/app/src/views/BudgetView.vue#L190)：`ringStyle` 用 conic-gradient
- 分类预算用 mini-ring 展示剩余比例

## 二、修改计划

### 修改 1：预算进度条 → Vant Progress + 反转逻辑

**文件：** [HomeView.vue](file:///d:/finance-manager/app/src/views/HomeView.vue)

1. **引入 Vant Progress**
   ```ts
   import { Progress } from 'vant'
   import 'vant/es/progress/style'
   ```

2. **反转进度逻辑**（`budgetProgress` computed）
   - `remainingPercent = max(0, ((total - spent) / total) * 100)` — 剩余型，从满格开始递减
   - `usedPercent = min(100, (spent / total) * 100)` — 上涨型，供展示用
   - 超支时 `remainingPercent = 0`

3. **模板替换**
   - 替换手搓 track 为 `<van-progress :percentage="remainingPercent" :color="'var(--color-primary-500)'" :show-pivot="false" />`
   - 超支时 color 改为 `#c0392b`
   - 底部文字显示：`剩余：¥X · 已用 Y%`（用 usedPercent 显示已用比例）

4. **CSS 清理**
   - 移除 `.budget-card__track` 相关样式
   - 保留 `.budget-card--over` 适配

### 修改 2：BudgetView 圆环 → 同步调整

**文件：** [BudgetView.vue](file:///d:/finance-manager/app/src/views/BudgetView.vue)

- 检查 `ringStyle` 计算逻辑，确保圆环也显示"剩余"而非"已用"
- 调整 conic-gradient：从剩余颜色开始，到已用颜色结束
- 颜色保持单一：正常 `var(--color-primary-500)`，超支 `#c0392b`

### 修改 3：RecentSummaryCard → echarts 柱状图

**文件：** [RecentSummaryCard.vue](file:///d:/finance-manager/app/src/components/RecentSummaryCard.vue)

echarts 5 已在 `package.json` 中。

1. **引入 echarts**
   ```ts
   import * as echarts from 'echarts'
   ```

2. **实现柱状图**
   - 初始化 echarts 实例（onMounted / onUnmounted 管理生命周期）
   - 双柱（收入 + 支出），与当前显示逻辑一致
   - 颜色：收入用 `--color-income`，支出用 `--color-expense`
   - X 轴：日期标签（周X 或 日期号）
   - Y 轴：隐藏刻度，保持紧凑
   - 响应式：监听 resize

3. **CSS 清理**
   - 移除 `.chart`、`.bar-group`、`.bars`、`.bar`、`.bar.income`、`.bar.expense` 样式
   - 容器改为 echarts 容器 div

### 依赖与风险

- echarts 5 已安装 ✅
- Vant Progress 已在项目中使用 ✅
- echarts 柱状图初始化需注意容器尺寸（高度 96px，与现有一致）
- BudgetView conic-gradient 与首页 Progress 颜色逻辑需保持一致（单一颜色，超支变红）

### 不修改的部分

- 顶部 hero 区域（月支出、月收入、本月结余）
- 日流水列表（DailyLedgerCard）
- 侧边抽屉、批量操作等
- 记账页面（RecordSheet）
