import { dateInputToLocalIso, toDateInputValue } from './reminder-dates'

const pad = (n: number) => String(n).padStart(2, '0')

/** 按本机本地字段算出的日期串，用来断言"本地日期"口径。 */
function localDateOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('toDateInputValue', () => {
  it('存库 ISO 按本地日期还原，而不是取 UTC 字符串前缀', () => {
    // 本地 11-08 零点在 UTC+8 存成 11-07T16:00Z
    const stored = '2026-11-07T16:00:00.000Z'
    expect(toDateInputValue(stored)).toBe(localDateOf(stored))
  })

  it('表单日期原样返回', () => {
    expect(toDateInputValue('2026-11-08')).toBe('2026-11-08')
  })

  it('非法/空值返回空串，不猜日期', () => {
    expect(toDateInputValue('')).toBe('')
    expect(toDateInputValue('not-a-date')).toBe('')
    expect(toDateInputValue('2026-02-30')).toBe('')
    expect(toDateInputValue('2026-11-07T16:00:00.000ZT00:00:00')).toBe('')
  })
})

describe('dateInputToLocalIso', () => {
  it('表单日期 → 本地零点 ISO，且能往返还原', () => {
    const iso = dateInputToLocalIso('2026-11-08')
    expect(toDateInputValue(iso)).toBe('2026-11-08')
    expect(new Date(iso).getHours()).toBe(0)
    expect(new Date(iso).getMinutes()).toBe(0)
  })

  it('回归：编辑已有提醒时把存库 ISO 再喂进来，不抛 Invalid time value', () => {
    const stored = '2026-11-07T16:00:00.000Z'
    const iso = dateInputToLocalIso(stored)
    expect(toDateInputValue(iso)).toBe(toDateInputValue(stored))
    expect(new Date(iso).getHours()).toBe(0)
  })

  it('非法日期抛中文错误，而不是英文 RangeError', () => {
    expect(() => dateInputToLocalIso('')).toThrow('到期日期格式不正确')
    expect(() => dateInputToLocalIso('2026-02-30')).toThrow('到期日期格式不正确')
    expect(() => dateInputToLocalIso('随便写的')).toThrow('到期日期格式不正确')

    try {
      dateInputToLocalIso('2026-11-07T16:00:00.000ZT00:00:00')
    } catch (error) {
      expect(error instanceof RangeError).toBe(false)
      expect(error instanceof Error ? error.message : '').toBe('到期日期格式不正确')
    }
  })
})
