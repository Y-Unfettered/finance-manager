import type { Migration } from '../core/types'

/**
 * v21：提醒来源标记（2026-11-08 需求：信用卡账期自动生成还款提醒）。
 *
 * 账户的 `credit_profiles` 里已有出账日/还款日，但提醒表此前只能手工录入。
 * 新增 managed_by 列用于区分"自动生成"与"用户手建"：
 * - NULL      = 用户手工创建（历史数据默认，行为不变，任何自动同步都不碰）
 * - 'credit_profile' = 由信用卡/信用账户的账期自动生成（账期变了跟着改、
 *   账户归档则停用、账户删除则一并清掉）
 *
 * 备注：自动同步代码按 account_id + managed_by 定位，绝不会误改手工提醒。
 */
export const REMINDER_MANAGED_BY_V21_MIGRATION: Migration = {
  version: 21,
  name: 'reminder_managed_by_v21',
  statements: `
ALTER TABLE reminders ADD COLUMN managed_by TEXT
  CHECK (managed_by IS NULL OR managed_by IN ('credit_profile'));
`,
}
