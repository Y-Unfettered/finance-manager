# 财务经理 APP UI V2

本目录为依据用户提供的“钱迹”参考截图重新生成的当前视觉方案。旧版保留在 `UI设计稿` 目录，仅用于对比；后续应以本目录 V2 为准。

> 开发测量、组件尺寸、字号、颜色、顶部栏与图标规则，以根目录 `UI设计规范_小米17ProMax.md` 的 V3.0 规范为准。V2 PNG 是视觉参考，不再作为人工量像素的唯一依据。

## V2 视觉原则

- 首页、月报和首次启动使用原创摄影图，其他操作页面保持白底。
- 字号比 V1 整体降低，只有首页主金额和净资产使用较大字号。
- 卡片圆角约 16dp，几乎不使用阴影。
- 使用高信息密度流水列表，减少大型彩色图标和仪表盘卡片。
- 深青色只用于进度、选中态和主操作；页面主体为白色与冷灰色。
- 目标画面比例与小米 17 Pro Max 的 1200×2608 接近；开发时仍需用 dp/sp 和动态 WindowInsets 实现。

## 页面清单

1. [首页母版](01-首页母版-v2.png)
2. [资产总览](02-资产总览-v2.png)
3. [快速记账](03-快速记账-v2.png)
4. [月报分析](04-月报分析-v2.png)
5. [负债与还款](05-负债与还款-v2.png)
6. [预付卡](06-预付卡-v2.png)
7. [投资资产](07-投资资产-v2.png)
8. [首次启动与迁移](08-首次启动与迁移-v2.png)
9. [预算管理](09-预算管理-v2.png)
10. [待确认账单](10-待确认账单-v2.png)
11. [账单搜索](11-账单搜索-v2.png)
12. [侧边菜单](12-侧边菜单-v2.png)

## 待补页面

- **应收款 / 借出款**：应收款列表、新建借出款、应收款详情与分次收回。本页在现有 V2 视觉稿中缺失，后续继续使用 V2 母版生成。
- 记账口径：借出本金是“资金账户减少、应收资产增加”的资产转移，不计消费；收回本金不计收入，利息单独计收入。

## Image 2.0 母版提示词

```text
Use case: ui-mockup
Asset type: shippable high-fidelity Android mobile finance app screen
Target: Xiaomi 17 Pro Max, portrait ratio 1200×2608, centered punch-hole safe area, edge-to-edge
Visual direction: premium, calm, restrained personal ledger; original editorial landscape photography only on emotional or report headers; cool light-gray page background; thin white cards; MiSans-like Chinese typography; tabular numerals; high information density
Typography: primary 14–20sp, main amount 28–30sp only, secondary 12sp; no oversized display typography
Components: 16dp card radius, hairline dividers, almost no shadows, 52–56dp list rows, simple line icons
Palette: mostly white, black and gray; deep teal #147665 only for selected states, progress and primary actions; muted coral for expense; green for income
Constraints: exact legible Chinese, no mojibake, no third-party logos, no coins, banknotes, cartoons, 3D decoration or watermark; no giant colored dashboard cards
```

后续页面以 `01-首页母版-v2.png` 作为 Image 2.0 视觉参考，并只替换页面信息结构，保持摄影调性、字号、卡片、色彩和图标一致。

## 参考图

用户提供的参考截图已复制到 `D:\财务经理\UI参考图`，仅用于研究信息密度和视觉调性，不作为直接复制模板。
