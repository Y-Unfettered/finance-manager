import { budgetRemainingRingPercent } from './budget-presentation'

describe('budgetRemainingRingPercent', () => {
  it('renders an unused budget as a full ring and consumes the ring as spending grows', () => {
    expect(budgetRemainingRingPercent(100_000, 0)).toBe(100)
    expect(budgetRemainingRingPercent(100_000, 25_000)).toBe(75)
    expect(budgetRemainingRingPercent(100_000, 12_000)).toBe(88)
    expect(budgetRemainingRingPercent(100_000, 100_000)).toBe(0)
    expect(budgetRemainingRingPercent(100_000, 120_000)).toBe(0)
  })

  it('keeps an unset budget ring empty', () => {
    expect(budgetRemainingRingPercent(0, 0)).toBe(0)
  })
})
