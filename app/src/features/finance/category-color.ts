/**
 * 分类颜色体系 2.0（PRD 需求一 4.5）：8 个主题语义色槽。
 *
 * - 分类颜色只存槽名（cat-1..cat-8），不存 hex；渲染时解析为当前主题的 token。
 * - 历史 hex（category_preferences.color 旧数据）读取时按 HSL 色相就近映射到槽位，
 *   无视觉丢失；用户重新保存分类后即落槽名。
 * - 深浅主题 × 绿蓝主题的槽色定义见 design-system/tokens.css 的 --color-cat-N。
 */

export const CATEGORY_COLOR_SLOTS = [
  'cat-1',
  'cat-2',
  'cat-3',
  'cat-4',
  'cat-5',
  'cat-6',
  'cat-7',
  'cat-8',
] as const

export type CategoryColorSlot = (typeof CATEGORY_COLOR_SLOTS)[number]

export const DEFAULT_CATEGORY_COLOR_SLOT: CategoryColorSlot = 'cat-1'

export function isCategoryColorSlot(value: string): value is CategoryColorSlot {
  return (CATEGORY_COLOR_SLOTS as readonly string[]).includes(value)
}

/** 槽名/历史 hex 统一解析为 CSS 颜色值（槽名 → var(--color-cat-N)，随主题自动切换）。 */
export function categoryColorVar(color?: string | null): string {
  const raw = (color ?? '').trim()
  if (isCategoryColorSlot(raw)) return `var(--color-${raw})`
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw
  return `var(--color-${DEFAULT_CATEGORY_COLOR_SLOT})`
}

/** 槽名/历史 hex 解析为具体色值（供 ECharts 等 canvas 场景使用，需 DOM）。 */
export function resolveCategoryColor(color?: string | null): string {
  const css = categoryColorVar(color)
  if (!css.startsWith('var(')) return css
  const name = css.slice(4, -1)
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const full = hex.length === 4 ? hex.replace(/([0-9a-fA-F])/g, '$1$1') : hex
  const r = parseInt(full.slice(1, 3), 16) / 255
  const g = parseInt(full.slice(3, 5), 16) / 255
  const b = parseInt(full.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s, l }
}

/**
 * 历史 hex → 就近色槽（按 HSL 色相映射；低饱和度归中性灰 cat-7）。
 * 槽：1 主题绿主 / 2 蓝 / 3 金 / 4 珊瑚红 / 5 紫 / 6 青 / 7 中性灰 / 8 棕。
 */
export function nearestColorSlot(hex: string): CategoryColorSlot {
  const { h, s } = hexToHsl(hex)
  if (s < 0.12) return 'cat-7'
  if (h < 15 || h >= 330) return 'cat-4'
  if (h < 35) return 'cat-8'
  if (h < 70) return 'cat-3'
  if (h < 175) return 'cat-1'
  if (h < 205) return 'cat-6'
  if (h < 255) return 'cat-2'
  if (h < 290) return 'cat-5'
  return 'cat-4'
}

/** 读取入口统一走这里：槽名原样返回，历史 hex 映射到槽位，空值落默认槽。 */
export function normalizeCategoryColor(color?: string | null): CategoryColorSlot {
  const raw = (color ?? '').trim()
  if (isCategoryColorSlot(raw)) return raw
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return nearestColorSlot(raw)
  return DEFAULT_CATEGORY_COLOR_SLOT
}
