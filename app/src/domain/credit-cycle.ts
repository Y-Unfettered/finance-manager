export interface CreditStatementPeriod {
  statementPeriodKey: string
  startUtc: string
  endUtc: string
}

export function statementPeriodForDate(occurredAt: string, billDay: number): CreditStatementPeriod {
  assertDay(billDay, '出账日')
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) throw new Error('交易日期格式不正确')
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const cutoff = utcDateClamped(year, month, billDay)
  const statementMonth = date.getTime() <= endOfUtcDay(cutoff).getTime() ? month : month + 1
  return statementPeriodForMonth(periodKey(year, statementMonth), billDay)
}

export function statementPeriodForMonth(
  statementPeriodKey: string,
  billDay: number,
): CreditStatementPeriod {
  assertDay(billDay, '出账日')
  const { year, month } = parsePeriodKey(statementPeriodKey)
  const currentCutoff = utcDateClamped(year, month, billDay)
  const previousCutoff = utcDateClamped(year, month - 1, billDay)
  return {
    statementPeriodKey,
    startUtc: addUtcDays(previousCutoff, 1).toISOString(),
    endUtc: addUtcDays(currentCutoff, 1).toISOString(),
  }
}

export function repaymentDateForStatement(
  statementPeriodKey: string,
  billDay: number,
  repaymentDay: number,
): string {
  assertDay(billDay, '出账日')
  assertDay(repaymentDay, '还款日')
  const { year, month } = parsePeriodKey(statementPeriodKey)
  const repaymentMonth = repaymentDay > billDay ? month : month + 1
  return utcDateClamped(year, repaymentMonth, repaymentDay).toISOString().slice(0, 10)
}

function parsePeriodKey(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) throw new Error('账单月份格式应为 YYYY-MM')
  const year = Number.parseInt(match[1]!, 10)
  const month = Number.parseInt(match[2]!, 10) - 1
  if (month < 0 || month > 11) throw new Error('账单月份格式应为 YYYY-MM')
  return { year, month }
}

function periodKey(year: number, month: number): string {
  const normalized = new Date(Date.UTC(year, month, 1))
  return `${normalized.getUTCFullYear()}-${String(normalized.getUTCMonth() + 1).padStart(2, '0')}`
}

function utcDateClamped(year: number, month: number, day: number): Date {
  const first = new Date(Date.UTC(year, month, 1))
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay)))
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

function endOfUtcDay(date: Date): Date {
  return new Date(date.getTime() + 86_400_000 - 1)
}

function assertDay(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`${label}必须是 1 至 31`)
  }
}
