# 修复记账页键盘闪烁与账户选择器状态残留

## 摘要

修复 `RecordSheet.vue` 中的两个 bug：
1. 编辑备注后点击「保存」返回首页时，系统键盘闪现一次。
2. 在「选择支付账户」界面按系统返回键回首页后，再次进入记账仍停留在选择账户界面。用户明确要求「正常重置」。

两个 bug 均集中在 `app/src/components/RecordSheet.vue` 单个文件，无需改动路由或其他组件。

## 当前状态分析

### 架构关键点（已通过探索确认）

- **KeepAlive 缓存**：[App.vue:77](file:///d:/finance-manager/app/src/App.vue#L77) 使用 `<KeepAlive :max="32">`，RecordSheet 被缓存。因此 `onMounted` 仅首次触发，后续进入触发 `onActivated`。两者都调用 `initializeFormState()`。
- **备注输入框**：[RecordSheet.vue:941-947](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L941-L947) 的 `<input v-model="merchant">` 是原生文本输入，会唤起系统键盘。
- **保存路径**：`handleKeyboardSave()` → `submit()` → [RecordSheet.vue:743](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L743) `navigateBack(router, { name: 'home' })`。保存/返回前**未对当前焦点元素调用 blur**。
- **账户选择器**：[AccountPicker.vue:63](file:///d:/finance-manager/app/src/components/AccountPicker.vue#L63) 使用 `v-if="show && pageActive"`。`pageActive` 由 `useRoutePageActive()` 注入，路由失活时变 false → 选择器视觉隐藏；但 `accountPickerShow`（RecordSheet 内部 ref）**不被重置**。
- **无硬件返回键监听**：[App.vue](file:///d:/finance-manager/app/src/App.vue) 仅监听 `appStateChange`，未监听 `backButton`。系统返回键走浏览器历史栈（`router.back()`），AccountPicker 不拦截返回键。

### Bug 1 根因

`备注` 输入框获焦后唤起系统键盘。用户手动收起键盘时，Android 收起手势通常不触发 input blur，输入框仍持有焦点。点击「保存」→ `submit()` → `navigateBack()` 期间，WebView 因焦点元素仍在页面上而短暂尝试重新唤起键盘，造成闪现。`submit()` 与 `goBack()` 在导航前都缺少失焦处理。

### Bug 2 根因

`initializeFormState()`（[RecordSheet.vue:304-370](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L304-L370)）重置了金额、分类、账户、备注等表单字段，但**未重置** `accountPickerShow`（line 96）和 `datePickerShow`（line 98）。用户在选择账户时按系统返回键回到首页后，RecordSheet 被 KeepAlive 缓存，`accountPickerShow` 仍为 `true`；再次进入记账时 `pageActive` 恢复为 true，AccountPicker 因 `show && pageActive` 再次渲染 → 残留。

## 拟定改动

全部改动均在 `app/src/components/RecordSheet.vue`。

### 改动 1：重置弹窗状态（修复 Bug 2）

在 `initializeFormState()` 中、`await loadOptions()` 之前，重置两个弹窗的显示状态。

位置：[RecordSheet.vue:325](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L325) `errorMessage.value = ''` 之后。

```ts
  errorMessage.value = ''
  accountPickerShow.value = false
  datePickerShow.value = false

  await loadOptions()
```

**原因**：每次进入记账页（含 KeepAlive 恢复）都强制关闭弹窗，符合用户「正常重置」的诉求。同时也覆盖日期选择器的同类残留问题。

### 改动 2：导航前失焦（修复 Bug 1）

在 `submit()` 与 `goBack()` 调用 `navigateBack` 之前，主动让当前焦点元素失焦，避免 WebView 在页面切换时重新唤起系统键盘。

位置 A：[RecordSheet.vue:614-616](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L614-L616) `goBack()`。

```ts
function goBack(): void {
  ;(document.activeElement as HTMLElement | null)?.blur()
  navigateBack(router, { name: 'home' })
}
```

位置 B：[RecordSheet.vue:743](file:///d:/finance-manager/app/src/components/RecordSheet.vue#L743) `submit()` 内 `navigateBack(router, { name: 'home' })` 之前。

```ts
    ;(document.activeElement as HTMLElement | null)?.blur()
    navigateBack(router, { name: 'home' })
```

**原因**：`goBack`（标题栏返回按钮）与 `submit`（保存按钮）都可能从备注输入框焦点态直接导航，两处都加 blur 以彻底消除键盘闪现。仅改 `submit` 可修复用户报告的保存路径，但 `goBack` 存在同样风险，一并处理避免遗漏。

## 假设与决策

- **假设**：备注输入框即模板中 `placeholder="点此输入备注…"` 的 `merchant` 输入框（line 941-947），这是唯一会唤起系统键盘的原生文本输入。
- **假设**：AccountPicker/DatePicker 的 `v-model:show` 双向绑定在父组件设置 `false` 后能正常关闭（已由 AccountPicker `emit('update:show', false)` 与 `v-if` 逻辑证实）。
- **决策**：Bug 2 按用户要求做「重置」而非「保留上次选择」。重置放在 `initializeFormState()` 而非 `onActivated`，以与现有重置逻辑保持一致，避免重复。
- **决策**：不引入 Capacitor `backButton` 监听来拦截返回键关闭弹窗——用户明确表示不需要保留该交互，重置更符合其体验，且改动更小、更稳定。
- **决策**：不在备注输入框上加 `@blur` 监听或修改 `keyboardVisible`——Vant NumberKeyboard 是自定义数字键盘，与系统键盘无关，无需改动。

## 验证步骤

1. **Bug 1 验证**：
   - 进入「修改」记账页，点击备注输入框唤起系统键盘。
   - 手动收起系统键盘，点击「保存」返回首页。
   - 预期：首页不再出现系统键盘闪现。
2. **Bug 1 旁路验证**：编辑备注后直接点标题栏返回按钮，预期同样无键盘闪现。
3. **Bug 2 验证**：
   - 进入记账页，点「选择支付账户」打开 AccountPicker。
   - 按系统返回键回到首页。
   - 再次进入记账页。
   - 预期：直接进入正常记账界面，AccountPicker 不再自动弹出。
4. **Bug 2 日期选择器旁路验证**：打开 DatePicker 后按返回键，再次进入记账页，预期 DatePicker 不残留。
5. **回归验证**：正常记账、转账、修改保存流程不受影响；选择账户/日期后正常选中并保存仍可用。
