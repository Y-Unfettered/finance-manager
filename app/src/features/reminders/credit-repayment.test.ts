// @vitest-environment node
import {
  creditRepaymentReminderTitle,
  hasCompleteCreditCycle,
  nextRepaymentDueDate,
} from './credit-repayment'

/** 用本地时间构造"当前时刻"，避免测试随设备时区漂移。 */
function localNow(year: number, month1to12: number, day: number, hour = 12): string {
  return new Date(year, month1to12 - 1, day, hour).toISOString()
}

/** 本地日期零点的 ISO（与提醒存库口径一致）。 */
function localDate(year: number, month1to12: number, day: number): string {
  return new Date(year, month1to12 - 1, day).toISOString()
}

describe('nextRepaymentDueDate', () => {
  it('今天正好是还款日时取今天（当天就能弹窗）', () => {
    expect(nextRepaymentDueDate(10, localNow(2026, 11, 10))).toBe(localDate(2026, 11, 10))
  })

  it('本月还款日未到则取本月', () => {
    expect(nextRepaymentDueDate(10, localNow(2026, 11, 8))).toBe(localDate(2026, 11, 10))
  })

  it('本月还款日已过则滚动到下月', () => {
    expect(nextRepaymentDueDate(5, localNow(2026, 11, 8))).toBe(localDate(2026, 12, 5))
  })

  it('短月按当月最后一天 clamp（31 号锚点在 11 月取 30 号）', () => {
    expect(nextRepaymentDueDate(31, localNow(2026, 11, 8))).toBe(localDate(2026, 11, 30))
  })

  it('跨年滚动（12 月底 → 次年 1 月）', () => {
    expect(nextRepaymentDueDate(5, localNow(2026, 12, 25))).toBe(localDate(2027, 1, 5))
  })

  it('闰年 2 月 clamp（31 号锚点 → 2 月 29 日）', () => {
    expect(nextRepaymentDueDate(31, localNow(2028, 2, 10))).toBe(localDate(2028, 2, 29))
  })

  it('还款日越界抛中文错误，不放英文 RangeError 出去', () => {
    expect(() => nextRepaymentDueDate(32, localNow(2026, 11, 8))).toThrow('还款日必须是 1 至 31')
    expect(() => nextRepaymentDueDate(0, localNow(2026, 11, 8))).toThrow('还款日必须是 1 至 31')
  })
})

describe('creditRepaymentReminderTitle', () => {
  it('账户名 + 还款', () => {
    expect(creditRepaymentReminderTitle('招商银行信用卡')).toBe('招商银行信用卡还款')
    expect(creditRepaymentReminderTitle('花呗')).toBe('花呗还款')
  })

  it('名字已含"还款"或为空时不做重复拼接', () => {
    expect(creditRepaymentReminderTitle('招商信用卡还款')).toBe('招商信用卡还款')
    expect(creditRepaymentReminderTitle('   ')).toBe('信用卡还款')
  })
})

describe('hasCompleteCreditCycle', () => {
  it('出账日 + 还款日都填了才算账期填全', () => {
    expect(hasCompleteCreditCycle({ billDay: 20, repaymentDay: 10 })).toBe(true)
    expect(hasCompleteCreditCycle({ billDay: 20 })).toBe(false)
    expect(hasCompleteCreditCycle({ repaymentDay: 10 })).toBe(false)
    expect(hasCompleteCreditCycle({})).toBe(false)
  })
})
