export function parseCnyInputToMinor(value: string): number {
  const normalized = value.trim().replaceAll(',', '')
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized)
  if (!match) {
    throw new Error('金额最多保留两位小数')
  }

  const yuan = Number(match[1])
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const minor = yuan * 100 + Number(fraction)
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw new Error('请输入大于 0 的有效金额')
  }
  return minor
}
