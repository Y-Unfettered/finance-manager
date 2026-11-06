import type { Migration } from '../core/types'

/**
 * v16：分类颜色 2.0（PRD 需求一 4.5）——已知历史默认色落位到色槽。
 *
 * category_preferences.color 的语义从"自由 hex"改为"主题色槽名（cat-1..8）"。
 * 历史任意 hex 由读取路径（category-repository → normalizeCategoryColor）按
 * HSL 色相就近映射，本迁移只把最常见的"新建默认蓝 #5b8def"归位到主题主色槽，
 * 使其恢复"跟随主题"的语义；其余 hex 待用户重新保存分类时自然落槽。
 */
export const CATEGORY_COLOR_SLOTS_V16_MIGRATION: Migration = {
  version: 16,
  name: 'category_color_slots_v16',
  statements: `
UPDATE category_preferences SET color = 'cat-1' WHERE color = '#5b8def';
UPDATE category_preferences SET color = 'cat-1' WHERE color = '#5B8DEF';
`,
}
