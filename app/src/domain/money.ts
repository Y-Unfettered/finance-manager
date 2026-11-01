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

export function formatMinorToCny(minor: number): string {
  // 负数（信用卡溢缴款/透支余额等）先取符号再按绝对值拼格式，
  // 否则 Math.floor(-50/100)=-1、cents=-50 → 输出畸形 "-1.-50"
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const yuan = Math.floor(abs / 100)
  const cents = abs % 100
  return cents > 0 ? `${sign}${yuan}.${String(cents).padStart(2, '0')}` : `${sign}${yuan}`
}
