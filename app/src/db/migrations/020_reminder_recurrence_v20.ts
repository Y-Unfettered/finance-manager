import type { Migration } from '../core/types'

/**
 * v20：到期提醒支持按月循环（2026-11-08 需求）。
 *
 * 信贷账户（花呗/白条/美团月付等）的还款日是"每月 X 号"的周期概念，
 * 原表只支持单次固定日期，每月都要手动重设。新增 recurrence 列：
 * 'none' = 单次（历史数据默认，行为不变）；'monthly' = 每月同日自动延续
 * （以到期日的"日"为锚，短月取当月最后一天，计算在 service 层做，不改存库日期）。
 */
export const REMINDER_RECURRENCE_V20_MIGRATION: Migration = {
  version: 20,
  name: 'reminder_recurrence_v20',
  statements: `
ALTER TABLE reminders ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none', 'monthly'));
`,
}
