/**
 * 主题色兜底常量：与 tokens.css 浅色（松石绿）主题同源。
 *
 * 仅用于 getCssVar() 取值失败时的运行时兜底（如 ECharts 需要具体色值）。
 * 规范约束（PRD 需求四 7.6.3）：hex 只允许出现在 tokens.css 与本文件，
 * .vue / 业务 .ts 内不得出现硬编码 hex（scripts/check-tokens.mjs 负责校验）。
 */
export const THEME_COLOR_FALLBACKS = {
  primary50: '#eef7f4',
  primary500: '#248561',
  primary600: '#176b5d',
  income: '#248561',
  expense: '#d45f5a',
  accentPurple: '#7c3aed',
  gold: '#d8a248',
  blue: '#5b8def',
  purple: '#8a73bd',
  teal: '#55a6a6',
  gray: '#999999',
  textPrimary: '#17211e',
  textSecondary: '#66726e',
  textTertiary: '#98a19e',
  surface: '#ffffff',
  background: '#f4f6f3',
  divider: '#e7ebe8',
  sideDrawerPrimary: '#6c5ce7',
  sideDrawerSecondary: '#9b8cff',
  sideDrawerPeach: '#ffc7b7',
  sideDrawerMuted: '#7f898f',
  /* 分布图（环形/条形）扩充配色：分类多时区分度更好 */
  pink: '#d98695',
  brown: '#a8763e',
  steel: '#6b8ba4',
}
