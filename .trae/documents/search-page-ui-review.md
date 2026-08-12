# 搜索页面 UI 一致性检查报告

> 项目：finance-manager（Vue 3 + TypeScript + Capacitor + Vant 4）
> 日期：2026-08-12

---

## 一、整体概况

本项目使用 **Vant 4.10.0**，但采用「薄 Vant + 厚自研」的策略：

- Vant 仅用于**底层基础设施组件**（Popup、DatePicker、NumberKeyboard、Tabs、Toast）
- 所有**视觉 UI**（按钮、卡片、开关、抽屉、弹窗、PIN 输入、图表）均为自研 Vue 组件
- 设计系统通过 `src/design-system/tokens.css` 中的 CSS 变量统一管理（支持绿色/蓝色主题、深色模式）

---

## 二、搜索页面现状分析

### 2.1 核心文件

| 文件 | 说明 |
|------|------|
| `src/views/TransactionSearchView.vue` | 搜索主页面（路由 `/search`） |
| `src/features/search/search-service.ts` | 搜索业务逻辑层 |
| `src/db/repositories/transaction-repository.ts` | SQLite 搜索查询 |

### 2.2 使用的原生/系统 UI 元素清单

TransactionSearchView.vue 中**完全没有使用 Vant 组件**，所有表单控件均为原生 HTML 元素：

| # | 原生元素 | 位置 | 当前样式来源 | 视觉问题 |
|---|----------|------|------------|----------|
| 1 | `<input type="search">` | 关键词搜索框 | 浏览器默认样式 + 简单 border | **问题最大**：iOS 自动带「取消」按钮和圆角阴影，Android 完全无样式，与 App 其他页面风格割裂 |
| 2 | `<input type="date">` (×2) | 开始/结束日期 | 浏览器默认日期选择器 | 系统弹窗样式（iOS 滚轮/Android 系统 picker），点击体验不一致 |
| 3 | `<select>` (×4) | 账户、分类类型、分类、交易类型 | 浏览器默认下拉框 | 系统原生下拉菜单，iOS/Android 显示方式完全不同，样式不可控 |
| 4 | `<input type="text">` (×2) | 最小/最大金额 | 简单 border | 基本可控，但与 `<input type="search">` 风格不统一 |
| 5 | `<input type="checkbox">` | 「包含已撤销交易」 | 浏览器默认复选框 | iOS 蓝色勾、Android 样式不同，不符合自研开关风格 |
| 6 | `<button>` (×3) | 清空、搜索按钮 | 自定义 CSS | ✅ 可接受——已有自定义样式，视觉符合设计系统 |
| 7 | `<button>` | 筛选条件折叠切换 | 自定义 CSS | ✅ 可接受 |

### 2.3 页面中其他 UI 元素评估

| 元素 | 组件 | 评估 |
|------|------|------|
| 顶部导航栏 | `AppTopBar` | ✅ 自定义组件，符合风格 |
| 筛选卡片 | `BaseCard` (variant="compact") | ✅ 自定义组件，符合风格 |
| 搜索结果卡片 | `BaseCard` (variant="compact") | ✅ 自定义组件，符合风格 |
| 金额显示 | `MoneyText` | ✅ 自定义组件 |
| 详情弹窗 | `TransactionDetailSheet` | ✅ 自定义组件 |
| 空状态区 | 自定义 HTML + Lucide 图标 | ✅ 符合风格 |
| 分组标题 h3 | 原生 `<h3>` | ⚠️ 轻微：无自定义样式，依赖浏览器默认 h3，建议加自定义 class |

---

## 三、Vant 4 组件匹配分析

### 3.1 有对应 Vant 组件的替换方案

| 原生元素 | Vant 4 对应组件 | 推荐度 | 说明 |
|----------|---------------|--------|------|
| `<input type="search">` | **`Search`** (van-search) | ⭐⭐⭐ | Vant 4 有原生 Search 组件，自带搜索图标、取消按钮、圆角。但需注意：**本项目目前未使用 Vant Search 的任何页面**，引入需额外 CSS 定制以匹配设计系统 |
| `<input type="date">` | **`DatePicker`** (van-date-picker) | ⭐⭐⭐ | 已有自研 `DatePicker.vue` 组件（基于 Vant DatePicker + Popup），**已有成熟方案可直接复用** |
| `<select>` | **`Picker`** (van-picker) | ⭐⭐⭐ | Vant Picker 提供滚动选择器。但本项目已有 `AccountPicker.vue`（自定义），`DatePicker.vue` 也用了 Picker。对于「分类类型」「交易类型」等选项较少的场景，**更适合用 ActionSheet 或自定义单选按钮组** |
| `<input type="checkbox">` | **`Checkbox`** (van-checkbox) | ⭐⭐ | Vant Checkbox 可用，但本项目已有 `AppSwitch`（自定义开关），建议统一使用开关样式 |

### 3.2 不适合用 Vant 的场景（建议自研）

| 场景 | 建议 | 原因 |
|------|------|------|
| 金额输入框 | 自研组件 | 需要自定义金额格式验证、Decimal 输入限制，通用 Vant Field 需较多定制 |
| 筛选条件折叠面板 | 自研即可（当前状态良好） | 当前已用自定义 CSS，效果符合风格 |
| 空状态区 | 自研即可（当前状态良好） | 已用 Lucide 图标 + 自定义布局 |

---

## 四、问题汇总与优先级

### 🔴 P0 - 必须解决（视觉割裂最严重）

1. **搜索输入框**（`<input type="search">`）
   - iOS Safari 强制渲染苹果搜索样式（蓝色取消按钮、圆角），无法完全定制
   - 建议：**自研组件** `SearchInput`，使用 `<input type="text">` + Lucide 搜索图标 + 清空按钮

2. **日期选择器**（`<input type="date">` ×2）
   - Android 调用系统对话框，iOS 显示内嵌滚轮，体验不一致
   - 建议：**复用已有 `DatePicker.vue`**（基于 Vant DatePicker），点击输入框弹出底部选择面板

### 🟡 P1 - 建议解决

3. **下拉选择框**（`<select>` ×4）
   - 系统原生下拉，iOS 从底部弹 ActionSheet，Android 从点击位置弹菜单
   - 建议：
     - 「分类类型」「交易类型」等选项固定较少的：**自研单选按钮组**（类似 `DatePicker` 中的「今天/昨天/前天」pill 按钮），视觉更精致
     - 「账户」「分类」等选项动态的：**复用 Vant Picker** 弹底选择器

4. **复选框**（`<input type="checkbox">`）
   - 建议：**复用 `AppSwitch` 组件** 或简化为行内开关样式

### 🟢 P2 - 可优化

5. **金额输入框**（`<input type="text" inputmode="decimal">` ×2）
   - 当前基本可用，但建议加统一样式封装

6. **分组标题 h3**
   - 当前依赖浏览器默认 h3 样式，建议添加自定义 class 统一字号、颜色

---

## 五、建议实施路线

### 方案 A（推荐）：渐进式替换，复用已有组件

| 步骤 | 动作 | 新增/复用组件 |
|------|------|-------------|
| 1 | 自研 `SearchInput` 组件替换 `<input type="search">` | 新组件 |
| 2 | 用已有 `DatePicker.vue` 替换 2 个 `<input type="date">` | 复用已有 |
| 3 | 自研 `OptionSelector` 单选按钮组组件，替换「分类类型」「交易类型」select | 新组件 |
| 4 | 用 Vant Picker 替换「账户」「分类」select | 新增 Vant Picker 引用 |
| 5 | 用 `AppSwitch` 替换 `<input type="checkbox">` | 复用已有 |
| 6 | 统一 h3 样式 | 微调 CSS |

**优点**：改动范围可控，复用已有组件减少重复工作，保持设计系统一致性
**缺点**：需新增 2 个组件

### 方案 B：全部自研，零依赖 Vant 表单组件

| 步骤 | 动作 |
|------|------|
| 1 | 自研 `SearchInput` |
| 2 | 复用 `DatePicker.vue` |
| 3 | 自研 `OptionSelector`（按钮组） |
| 4 | 自研 `AccountPickerInline` 和 `CategoryPickerInline`（内联下拉选择器） |
| 5 | 复用 `AppSwitch` |

**优点**：完全不引入新 Vant 组件，UI 100% 一致
**缺点**：开发量更大，需要更多自研组件

### 方案 C：全量使用 Vant 4 表单组件

引入 `Search`、`Field`、`Picker`、`Checkbox` 等 Vant 组件。

**优点**：开发最快，Vant 自带交互
**缺点**：Vant 组件默认样式与设计系统有差异，需要大量 CSS override；与项目「厚自研」策略不一致

---

## 六、推荐结论

**推荐方案 A**，理由：

1. 搜索输入框（最大痛点）→ 自研 `SearchInput`，完全可控
2. 日期选择 → 直接复用已有的 `DatePicker.vue`（已经基于 Vant 做了封装）
3. 选项较少的下拉 → 自研 pill 按钮组，与 `DatePicker` 的「今天/昨天/前天」风格一致
4. 动态选项的下拉 → Vant Picker 弹底选择器，符合移动端体验
5. 复选框 → 复用 `AppSwitch`

这样改动最小、一致性最高，且不会引入新的 Vant 组件依赖。

---

## 七、附件：当前页面结构速览

```
TransactionSearchView.vue
├── AppTopBar（✅ 自定义）
├── BaseCard「筛选条件」（✅ 自定义）
│   ├── 折叠按钮（✅ 自定义）
│   ├── [输入框] 关键词    ← 🔴 P0 原生 <input type=search>
│   ├── [日期] 开始/结束    ← 🔴 P0 原生 <input type=date>
│   ├── [下拉] 账户        ← 🟡 P1 原生 <select>
│   ├── [下拉] 分类类型    ← 🟡 P1 原生 <select>
│   ├── [下拉] 分类        ← 🟡 P1 原生 <select>
│   ├── [下拉] 交易类型    ← 🟡 P1 原生 <select>
│   ├── [文本] 最小/最大金额 ← 🟢 P2 原生 <input>
│   ├── [复选框] 已撤销    ← 🟡 P1 原生 <checkbox>
│   └── [按钮] 清空/搜索  ✅ 自定义
├── 空状态区（✅ 自定义）
├── 搜索结果
│   ├── 汇总栏（✅ 自定义）
│   ├── h3 分组标题        ← 🟢 P2 原生 <h3>
│   └── BaseCard 结果项    ✅ 自定义
└── TransactionDetailSheet  ✅ 自定义
```

---

*以上为完整检查结果，请审阅后确认方向。*