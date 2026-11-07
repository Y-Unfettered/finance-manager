import type { Migration } from '../core/types'

/**
 * v19：重置"默认色映射"产生的分类色偏好（2026-11-07 回测）。
 *
 * v16 曾把历史默认色 #5b8def 整体映射为 cat-1（主题绿），导致全部分类
 * 在环形图/条形图中同色（绿），共享调色板被架空——与本机回测期望不符
 * （用户从未自选过颜色，PRD 已记录"用户不想自己调"）。
 * 本迁移把 cat-1 的颜色偏好清空（保留图标偏好）：无偏好的分类在分布图
 * 中按序取 9 色共享调色板；分类管理图标回落默认槽，仍是主题绿。
 * 用户此后仍可在分类编辑里主动选择任意色槽。
 */
export const CATEGORY_COLOR_RESET_V19_MIGRATION: Migration = {
  version: 19,
  name: 'category_color_reset_v19',
  statements: `
UPDATE category_preferences SET color = NULL WHERE color = 'cat-1';
`,
}
