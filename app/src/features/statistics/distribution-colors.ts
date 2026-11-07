import { THEME_COLOR_FALLBACKS } from '@/design-system/color-fallbacks'

/**
 * 支出分布图（环形/条形）共享配色：无分类色的切片按序取色。
 * 环形图与条形图吃同一份归一化数组（同序），按下标取色即保证两图一一对应同色
 * （此前条形图无色柱全画主色绿，观感单调——2026-11-07 回测反馈）。
 * CSS 场景（图例圆点）直接用 var(...) 字符串；canvas 场景用 resolve 版本。
 */
export const DISTRIBUTION_COLORS: readonly string[] = [
  'var(--color-primary-500)',
  THEME_COLOR_FALLBACKS.gold,
  THEME_COLOR_FALLBACKS.blue,
  THEME_COLOR_FALLBACKS.expense,
  THEME_COLOR_FALLBACKS.purple,
  THEME_COLOR_FALLBACKS.teal,
  THEME_COLOR_FALLBACKS.pink,
  THEME_COLOR_FALLBACKS.brown,
  THEME_COLOR_FALLBACKS.steel,
]

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 按序取分布配色（可能返回 var(...) 字符串，供 CSS 使用）。 */
export function distributionColorAt(index: number): string {
  const css = DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]
  if (!css) return THEME_COLOR_FALLBACKS.gray
  if (css.startsWith('var(')) return getCssVar(css.slice(4, -1)) || THEME_COLOR_FALLBACKS.primary500
  return css
}
