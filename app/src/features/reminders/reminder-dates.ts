/**
 * 提醒日期在两种表示之间转换（纯函数，编辑表单与单测共用）。
 *
 * 项目里日期有两种口径，混用会出事：
 * - 存库口径：**本地零点**的 UTC ISO 串。如本地 11-08 零点存成 `2026-11-07T16:00:00.000Z`（UTC+8）。
 * - 表单口径：`YYYY-MM-DD`，`AppDateInput` / `DateTimePicker` 读写的就是这个。
 *
 * 2026-11-08 线上报错 `RangeError: Invalid time value`：编辑已有提醒时把存库 ISO 原样塞进
 * 表单，保存时又拼了一次 `T00:00:00`，得到 `2026-11-07T16:00:00.000ZT00:00:00`
 * → Invalid Date → `toISOString()` 抛英文 RangeError。这两个函数就是治它的：一律按
 * **本地日期字段**取日，禁止用字符串前缀切（UTC 串的前缀比本地日期早一天）。
 */

const PURE_DATE = /^\d{4}-\d{2}-\d{2}$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地日期字段 → 'YYYY-MM-DD'。 */
function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 纯日期串校验（拒绝 2026-02-30 这类会被 Date 静默进位的日期）。 */
function parsePureDate(text: string): Date | undefined {
  const [y, m, d] = text.split('-').map(Number)
  if (!y || !m || !d) return undefined
  const date = new Date(y, m - 1, d)
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return undefined
  }
  return date
}

/**
 * 任意日期串（存库 ISO 或表单日期）→ 表单用的 `YYYY-MM-DD`，按本地日期取。
 * 无法解析时返回空串，让用户重新选日期，而不是拿一个错的日子去存。
 */
export function toDateInputValue(value: string): string {
  const text = (value ?? '').trim()
  if (text === '') return ''
  if (PURE_DATE.test(text)) {
    return parsePureDate(text) ? text : ''
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return localDateString(date)
}

/**
 * 表单日期 → 存库口径（本地零点的 UTC ISO）。
 * 纯日期走本地字段构造（不受设备时区正负影响）；带时间的串先按本地日期归零。
 * 格式非法抛中文错误，绝不让 `RangeError: Invalid time value` 这种英文异常冒到界面上。
 */
export function dateInputToLocalIso(value: string): string {
  const text = (value ?? '').trim()
  if (text === '') throw new Error('到期日期格式不正确')

  if (PURE_DATE.test(text)) {
    const date = parsePureDate(text)
    if (!date) throw new Error('到期日期格式不正确')
    return date.toISOString()
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) throw new Error('到期日期格式不正确')
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).toISOString()
}
