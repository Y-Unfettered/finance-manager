import {
  repaymentDateForStatement,
  statementPeriodForDate,
  statementPeriodForMonth,
} from './credit-cycle'

describe('credit statement cycle', () => {
  it('assigns the bill-day transaction to the current statement', () => {
    expect(statementPeriodForDate('2026-04-20T23:59:59.000Z', 20)).toEqual({
      statementPeriodKey: '2026-04',
      startUtc: '2026-03-21T00:00:00.000Z',
      endUtc: '2026-04-21T00:00:00.000Z',
    })
  })

  it('assigns the day after bill day to next statement', () => {
    expect(statementPeriodForDate('2026-04-21T00:00:00.000Z', 20).statementPeriodKey).toBe(
      '2026-05',
    )
  })

  it('uses the last natural day when bill day does not exist', () => {
    expect(statementPeriodForMonth('2027-02', 31)).toEqual({
      statementPeriodKey: '2027-02',
      startUtc: '2027-02-01T00:00:00.000Z',
      endUtc: '2027-03-01T00:00:00.000Z',
    })
  })

  it('calculates the next-month repayment date when repayment day precedes bill day', () => {
    expect(repaymentDateForStatement('2026-08', 18, 6)).toBe('2026-09-06')
  })
})
