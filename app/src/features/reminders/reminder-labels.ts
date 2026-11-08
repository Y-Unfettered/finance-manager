import type { ReminderType } from '@/domain/entities'

/** 提醒类型的展示文案（列表页与首页弹窗共用，避免两处漂移）。 */
export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  credit_card_due: '信用卡还款',
  prepaid_expiry: '预付卡到期',
  receivable_due: '应收款到期',
  custom: '自定义提醒',
}

export function reminderTypeLabel(type: ReminderType): string {
  return REMINDER_TYPE_LABELS[type] ?? type
}

/** 距到期天数的文案：负数即已过期（列表页用"已逾期 N 天"角标）。 */
export function daysLabel(days: number): string {
  if (days === 0) return '今天到期'
  if (days === 1) return '明天到期'
  if (days < 0) return `已逾期 ${Math.abs(days)} 天`
  return `${days} 天后到期`
}

/** 本地日期 YYYY-MM-DD（与存库口径一致，不走 UTC）。 */
export function formatReminderDate(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
