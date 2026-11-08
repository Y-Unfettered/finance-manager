/**
 * 信用卡账期 → 还款提醒的日期锚点（纯函数，同步服务与单测共用）。
 *
 * 口径严格按"本地日期"：
 * - 还款日是"每月 X 号"的周期概念，提醒的 dueDate 存**本地零点**的 UTC ISO
 *   （与 RemindersView 的存库口径一致）。这里用本地字段构造 `new Date(y, m, d)`，
 *   禁止 `Date.UTC` / 字符串拼接，否则 UTC+8 下会把"今天到期"判成昨天。
 * - 今天正好是还款日 → 取今天（首页弹窗当天就能弹）。
 * - 本月还款日已过 → 取下一月；短月按当月最后一天 clamp（31 号 → 2 月 28/29、4 月 30）。
 * - 只认还款日，不参与出账日计算：提醒是"每月同日"，出账日只用于判断账期是否填全。
 */

/** 还款日是否有效（1~31）。 */
export function isValidRepaymentDay(day: number | undefined): day is number {
  return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31
}

/** 账期是否填全（出账日 + 还款日都有值才自动生成提醒）。 */
export function hasCompleteCreditCycle(profile: {
  billDay?: number
  repaymentDay?: number
}): boolean {
  return Boolean(profile.billDay && profile.repaymentDay)
}

/**
 * 从"今天"起算的下一个还款日，返回本地零点 ISO。
 * 传入时间非法或还款日越界时抛中文错误（不把英文 RangeError 放出去）。
 */
export function nextRepaymentDueDate(repaymentDay: number, nowIso: string): string {
  if (!isValidRepaymentDay(repaymentDay)) {
    throw new Error('还款日必须是 1 至 31')
  }
  const now = new Date(nowIso)
  if (Number.isNaN(now.getTime())) {
    throw new Error('当前时间格式不正确')
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisMonth = clampedLocalDate(today.getFullYear(), today.getMonth(), repaymentDay)
  const due =
    thisMonth.getTime() < today.getTime()
      ? clampedLocalDate(today.getFullYear(), today.getMonth() + 1, repaymentDay)
      : thisMonth
  return due.toISOString()
}

/** 自动生成提醒的标题：`${账户名}还款`（账户名本身已含"还款"时不重复拼接）。 */
export function creditRepaymentReminderTitle(accountName: string): string {
  const name = accountName.trim()
  if (name === '') return '信用卡还款'
  return name.endsWith('还款') ? name : `${name}还款`
}

/** 本地某年某月的"第 day 号"，超出当月天数时取月末。 */
function clampedLocalDate(year: number, month: number, day: number): Date {
  const first = new Date(year, month, 1)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay))
}
