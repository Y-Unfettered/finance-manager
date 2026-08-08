import { describe, expect, it } from 'vitest'

import { detectDelimiter, parseCsv } from './csv-parser'

describe('parseCsv', () => {
  it('parses a simple comma-separated file with headers', () => {
    const result = parseCsv('date,amount,note\n2026-08-01,12.50,午餐\n2026-08-02,8.00,早餐')
    expect(result.headers).toEqual(['date', 'amount', 'note'])
    expect(result.rows).toEqual([
      ['2026-08-01', '12.50', '午餐'],
      ['2026-08-02', '8.00', '早餐'],
    ])
    expect(result.errors).toEqual([])
  })

  it('strips a BOM and normalizes CRLF line endings', () => {
    const input = '\uFEFFdate,amount\r\n2026-08-01,1.00\r\n'
    const result = parseCsv(input)
    expect(result.headers).toEqual(['date', 'amount'])
    expect(result.rows).toEqual([['2026-08-01', '1.00']])
  })

  it('returns empty headers and rows for blank input', () => {
    const result = parseCsv('   \n  ')
    expect(result.headers).toEqual([])
    expect(result.rows).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('handles quoted fields with embedded commas and quotes', () => {
    const input = `"note","amount"\n"午餐, 晚餐","12.50"\n"say ""hi""","3.00"`
    const result = parseCsv(input)
    expect(result.headers).toEqual(['note', 'amount'])
    expect(result.rows).toEqual([
      ['午餐, 晚餐', '12.50'],
      ['say "hi"', '3.00'],
    ])
  })

  it('supports tab and semicolon delimiters via options', () => {
    const tabResult = parseCsv('date\tamount\n2026-08-01\t1.00', { delimiter: '\t' })
    expect(tabResult.headers).toEqual(['date', 'amount'])
    expect(tabResult.rows).toEqual([['2026-08-01', '1.00']])

    const semicolonResult = parseCsv('date;amount\n2026-08-01;1.00', { delimiter: ';' })
    expect(semicolonResult.headers).toEqual(['date', 'amount'])
  })

  it('reports unclosed quotes and still returns parsed rows', () => {
    const input = '"note","amount"\n"未闭合,12.50'
    const result = parseCsv(input)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.headers).toEqual(['note', 'amount'])
  })

  it('pads short rows and reports oversized rows', () => {
    const input = 'a,b,c\n1,2\n1,2,3,4'
    const result = parseCsv(input)
    expect(result.rows[0]).toEqual(['1', '2', ''])
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('detectDelimiter', () => {
  it('detects comma by default', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
  })

  it('detects semicolon when more frequent than comma', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
  })

  it('detects tab', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
  })

  it('falls back to comma for empty input', () => {
    expect(detectDelimiter('')).toBe(',')
  })
})
