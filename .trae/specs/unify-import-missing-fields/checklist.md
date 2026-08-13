# Checklist

## 数据层
- [ ] `ImportPlan` 包含 `missingFields` 字段
- [ ] `MissingField` 类型定义完整（`rowIndex`, `fieldId`, `fieldType`, `displayLabel`, `candidates?`, `selectedValue?`）
- [ ] 所有6种字段（date/sourceAccount/targetAccount/category/type/amount）缺失都能被检测到
- [ ] 已选择的字段不会重复出现在 `missingFields` 中
- [ ] `missingFields` 按 `rowIndex` 排序

## 账户ID匹配
- [ ] AI 提示词中账户清单附带 ID（`可用余额 (acc_xxx1)` 格式）
- [ ] AI 提示词输出格式要求包含 `accountId` 和 `targetAccountId` 字段
- [ ] 提示词示例 JSON 包含 ID 字段
- [ ] 导入时 `accountId` 优先精确匹配
- [ ] `targetAccountId` 同样支持 ID 匹配
- [ ] ID 匹配失败后回退到精确→子串→missingFields
- [ ] 账户改名后提示词中显示新名称 + 原 ID

## 余额宝自动转入
- [ ] note 含"余额宝-自动转入"时自动识别为转账
- [ ] 源账户自动设为"支付宝余额"
- [ ] 转入账户自动设为"余额宝"

## UI 层
- [ ] 预览步骤显示统一的"需要确认的字段"区域
- [ ] picker 类型字段用 VanPicker 展示候选列表
- [ ] input 类型字段用文本输入框
- [ ] 所有字段选择完成后"导入"按钮激活
- [ ] 重新检查后已选择的字段卡片消失
- [ ] 无缺失字段时不显示确认区域