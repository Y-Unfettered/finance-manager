// @vitest-environment node
import { systemIdGenerator } from './identity'
import { toUtcIso } from './time'

describe('identity and time standards', () => {
  it('creates prefixed opaque entity IDs', () => {
    expect(systemIdGenerator.next('ledger')).toMatch(/^ledger_[a-f0-9]{32}$/)
    expect(systemIdGenerator.next('transaction')).toMatch(/^transaction_[a-f0-9]{32}$/)
  })

  it('normalizes local date-times to UTC ISO strings', () => {
    expect(toUtcIso('2026-08-03T08:00:00+08:00')).toBe('2026-08-03T00:00:00.000Z')
  })

  it('rejects invalid date-times', () => {
    expect(() => toUtcIso('not-a-date')).toThrow('Date-time must be valid')
  })
})
