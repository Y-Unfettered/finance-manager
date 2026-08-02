import { parseCnyInputToMinor } from './money'

describe('money input', () => {
  it.each([
    ['1', 100],
    ['1.2', 120],
    ['1.23', 123],
    ['1,396.97', 139_697],
    [' 38.00 ', 3800],
  ])('parses %s to integer minor units', (input, expected) => {
    expect(parseCnyInputToMinor(input)).toBe(expected)
  })

  it.each(['', '0', '-1', '1.234', 'abc', '.5'])('rejects invalid amount input %s', (input) => {
    expect(() => parseCnyInputToMinor(input)).toThrow()
  })
})
