# 设置页面系统原生组件替换方案

> 日期：2026-08-12  
> 目标：梳理项目内所有"系统原生 UI 元素"，明确替换策略，使 UI 与 V3 设计系统一致

---

## 一、现状总览

### 1.1 Vant 4 使用范围

项目当前使用了 Vant 4，但**仅按需引入了 8 个组件**，使用方式高度克制：

| Vant 组件 | 使用位置 | 用途 |
|-----------|----------|------|
| `Tabs` / `Tab` | `BillsView.vue` | 日历/指标切换标签 |
| `DatePicker` | `DatePicker.vue`, `MonthPickerSheet.vue`, `AssetStatisticsView.vue` | 日期选择器 |
| `Popup` | `SideDrawer.vue`, `AppBottomSheet.vue`, `DatePicker.vue`, `LogView.vue`, `ImportView.vue` | 底部弹层容器 |
| `showToast` | `AIPromptView.vue`, `LogView.vue`, `ImportView.vue` | 轻提示 |
| `showConfirmDialog` | `LogView.vue` | 确认对话框 |
| `NumberKeyboard` | `RecordSheet.vue` | 数字键盘 |
| `Field` (VanField) | `LogView.vue`, `ImportView.vue` | 表单输入 |
| `Picker` (VanPicker) | `LogView.vue`, `ImportView.vue` | 选择器 |

**Vant 4 未使用的组件**（但有潜在价值）：
- `Cell` / `CellGroup` — 列表行
- `Switch` — 开关
- `Radio` / `RadioGroup` — 单选组
- `Checkbox` — 复选框
- `Area` — 地区选择器

### 1.2 问题页面清单

逐项检查了项目内所有 `.vue` 视图，存在**系统原生控件**的页面如下：

| 页面 | 原生元素 | 具体位置 | 严重度 |
|------|----------|----------|--------|
| **SettingsView.vue** | `<select>` × 5 | 最近汇总类型/范围、默认账户、主题色、明暗模式 | 🔴 高 |
| **SettingsView.vue** | `<input type="checkbox">` × 1 | 记住上次使用账户 | 🟡 中 |
| **RemindersView.vue** | `<select>` × 2 | 提醒类型、关联账户 | 🟡 中 |
| **RemindersView.vue** | `<input type="date">` × 1 | 到期日期 | 🟡 中 |
| **RemindersView.vue** | `<input type="number">` × 1 | 提前几天提醒 | 🟡 中 |
| **RemindersView.vue** | `<input type="checkbox">` × 1 | 启用此提醒 | 🟡 中 |
| **LogView.vue** | Vant Field + Picker | 筛选区（已有 Vant 组件，但外观与全局不统一） | 🟢 低 |

### 1.3 为什么 SettingsView 是最高优先级

`SettingsView.vue` 是当前设置入口，用户第一感知。其 5 个 `<select>` 下拉框在 Android 上会弹出系统级滚轮选择器，视觉上与项目 V3 设计系统的"白色轻卡片 + 16px 圆角 + 青绿色主色"完全不搭。checkbox 同样显示为 Android 原生样式。

---

## 二、V3 设计系统相关要求

摘自 [UI设计规范_小米17ProMax.md](../UI设计规范_小米17ProMax.md)：

- **选择器**："选择器优先用底部弹层，不用居中小弹窗"（第 7.5 节）
- **输入框高度**：52dp
- **卡片圆角**：16dp（`--radius-card`）
- **控件圆角**：12dp（`--radius-control`）
- **主色**：#176B5D（松石绿）
- **按钮**：48dp 高，主色实心白字

---

## 三、替换方案（逐组件分析）

### 3.1 `<select>` 下拉框 → 底部选择器弹层

**问题**：`<select>` 在 Android 上是系统原生滚轮，样式无法定制，且不支持左侧 label 显示。

**Vant 替代方案**：Vant 4 的 `Picker` + `Popup` 组合（已在 LogView.vue 中使用），但需要二次封装成"行内展示 + 点击弹层"的交互模式，类似 iOS Settings 的箭头点击效果。

**推荐方案**：**自定义封装组件 `AppSelect`**，复用项目已有的 `AppBottomSheet` 模式：
- 行内展示：显示选中值的文本 + 右侧 `ChevronRight`
- 点击后：弹出 `AppBottomSheet`，内部展示选项列表，每项可点击选中
- 已使用的 `AppBottomSheet` + `Popup` 基础设施可直接复用

**涉及文件**：
- `SettingsView.vue`：5 个 select → 5 个 AppSelect
- `RemindersView.vue`：2 个 select → 2 个 AppSelect（可在同批次处理）

### 3.2 `<input type="checkbox">` → 自定义开关或 Vant Checkbox

**问题**：原生 checkbox 在不同 Android 版本上样式差异很大。

**Vant 替代方案**：Vant 4 的 `Checkbox` 组件。但项目已有 `PinSetupView.vue` 中实现了自定义 switch（带圆角胶囊滑块），风格与项目 V3 更统一。

**推荐方案**：
- 对于**开关型**设置（如"记住上次使用账户"、"启用此提醒"）→ 使用自定义 `Switch` 组件，与 PinSetupView 中的 switch 统一（48×28px 胶囊滑块）
- 可先抽出 PinSetupView 中的 switch 为可复用组件 `AppSwitch.vue`

### 3.3 `<input type="date">` → DatePicker 或底部日期弹层

**问题**：`<input type="date">` 在 Android 上显示为系统日期选择器，样式不可控。

**Vant 替代方案**：项目已有 `DatePicker.vue` 组件（基于 Vant DatePicker），可复用。但当前 `DatePicker.vue` 仅支持 `initialDate` 字符串输入，需增加双向绑定的 `v-model` 模式，才能直接替换 `<input type="date">`。

**推荐方案**：
- 为 `DatePicker.vue` 增加 `v-model` 模式，使其可直接作为行内选择器使用
- 或新建 `AppDateInput.vue` 组件，点击行内区域弹出 `DatePicker`

### 3.4 `<input type="number">` → 自定义数字输入或 NumberKeyboard

**问题**：`<input type="number">` 在 Android 上默认唤起数字键盘，外观为原生样式。

**推荐方案**：
- 保留 HTML `<input type="number">`，但通过 CSS 移除原生样式（`appearance: none`），使用项目 token 中的颜色、圆角、字号
- 对于"提前几天提醒"这类简单数值，行内输入框 + 边框即可，不需要弹出键盘
- 如果后续需要更复杂的金额输入，可复用 `NumberKeyboard`

### 3.5 LogView 中的 Vant Field

**问题**：LogView.vue 使用了 `VanField` 组件，其样式（带下划线、原生字体）与全局"白色圆角卡片 + 无边框"的风格不统一。

**推荐方案**：
- 将 `VanField` 替换为原生 `<input>` + CSS（使用 `--color-surface` 背景 + `--radius-control` 圆角 + `--color-divider` 边框）
- 筛选区的 Picker 可保留 `VanPicker`（因为 Picker 滚轮效果本身无可替代，且通过 tokens 已对齐了颜色）

---

## 四、实施建议

### 4.1 新增/修改的组件

| 组件 | 路径 | 类型 | 说明 |
|------|------|------|------|
| `AppSelect.vue` | `src/components/AppSelect.vue` | **新建** | 行内展示 + 点击弹层的选择器，替代所有 `<select>` |
| `AppSwitch.vue` | `src/components/AppSwitch.vue` | **新建** | 开关组件，从 PinSetupView 抽出 |
| `DatePicker.vue` | `src/components/DatePicker.vue` | **改造** | 增加 `v-model` 双向绑定模式 |
| `SettingsView.vue` | `src/views/SettingsView.vue` | **修改** | 替换全部原生控件 |
| `RemindersView.vue` | `src/views/RemindersView.vue` | **修改** | 替换全部原生控件 |
| `LogView.vue` | `src/views/LogView.vue` | **修改** | 替换 VanField 为原生 input + CSS |

### 4.2 各组件设计规格

**AppSelect**：
```
┌─────────────────────────────────┐
│ 最近汇总类型  [收入与支出 >    ]│  ← 行内展示选中值 + 箭头
└─────────────────────────────────┘
```
- 高度 52dp（与 V3 输入框一致）
- 点击后弹出 AppBottomSheet
- 选项列表行高 56dp，选中项主色高亮
- 接收 props: `modelValue`, `options: {label, value}[]`

**AppSwitch**：
```
┌─────────────────────────────────┐
│ 记住上次使用账户  [●━━━]        │  ← 左侧文字 + 右侧开关
└─────────────────────────────────┘
```
- 开关尺寸 48×28px
- 圆角胶囊，滑块白色圆点
- 开启态：`--color-primary-600`；关闭态：`--color-divider`

**AppDateInput**（或 DatePicker 扩展）：
```
┌─────────────────────────────────┐
│ 到期日期     [2026-08-12 >    ] │  ← 行内展示日期 + 箭头
└─────────────────────────────────┘
```
- 点击弹出现有 DatePicker 组件
- `v-model` 绑定的日期字符串

### 4.3 优先级建议

1. **第一批（必做）**：SettingsView — 最高优先级，5 个 select + 1 个 checkbox 全部替换
2. **第二批（建议）**：RemindersView — 2 个 select + 1 个 date + 1 个 number + 1 个 checkbox
3. **第三批（可选）**：LogView — 替换 VanField

---

## 五、假设与决定

| 编号 | 决定 | 理由 |
|------|------|------|
| 1 | 不在 `main.ts` 全局注册 Vant，继续使用按需引入 | 与项目现有模式一致，减少 bundle 体积 |
| 2 | 选择器使用底部弹层而非居中小弹窗 | 符合 V3 设计规范"选择器优先用底部弹层" |
| 3 | 开关使用自定义 CSS 而非 Vant Switch | 项目已有 PinSetupView 中完全一致的自定义实现，复用一致性更高 |
| 4 | DatePicker 增加 `v-model` 模式，不新建 `AppDateInput` | 避免增加不必要的组件，减少复杂度 |
| 5 | 数字输入保留原生 input 仅做样式定制 | "提前几天提醒"是简单数值，使用完整 NumberKeyboard 过度设计 |
| 6 | RemindersView 与 SettingsView 同批次处理 | 两者原生控件类型高度重叠，一次性替换避免重复劳动 |

---

## 六、验证步骤

1. 运行 `npm run dev` 确认所有页面正常加载
2. 检查 SettingsView：5 个选择项点击后弹出底部弹层，可正常选择并保存
3. 检查 RemindersView：新增/编辑提醒表单控件样式统一
4. 检查深色模式：所有新组件正确响应 `data-theme="dark"`
5. 检查蓝色主题：所有新组件正确响应 `data-color-theme="blue"`
6. 检查 Android 真机：无系统原生控件样式泄露

---

## 七、待确认问题

1. **RemindersView 是否一并处理？** 建议是同批次，但如果只想先改 SettingsView，可以分批。
2. **LogView 中的 Picker 滚轮**是否需要保留 Vant Picker？个人建议保留（Vant Picker 的滚轮交互无可替代），仅替换 Field。
3. **SettingsView 中的"记住上次使用账户"** — 你想用开关样式还是 Vant 复选框样式？建议开关，与 PinSetupView 一致。