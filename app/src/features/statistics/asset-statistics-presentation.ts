import type { AssetTrendPoint } from './statistics-service'

export type AssetTrendMode = 'net' | 'assets' | 'liabilities'

export interface AssetMonthComparison {
  changeMinor: number
  percent: number
  direction: 'increase' | 'decrease' | 'unchanged'
}

export function fillAssetTrendPoints(
  points: readonly AssetTrendPoint[],
  startPeriod: string,
  endPeriod: string,
): AssetTrendPoint[] {
  if (startPeriod > endPeriod) return []

  const byPeriod = new Map(points.map((point) => [point.periodKey, point]))
  const result: AssetTrendPoint[] = []
  const [startYear, startMonth] = parsePeriod(startPeriod)
  const [endYear, endMonth] = parsePeriod(endPeriod)
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1))
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1))

  while (cursor <= end) {
    const periodKey = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    result.push(
      byPeriod.get(periodKey) ?? {
        periodKey,
        assetsMinor: 0,
        liabilitiesMinor: 0,
        netAssetsMinor: 0,
        changeMinor: 0,
      },
    )
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return result
}

export function assetTrendValueMinor(point: AssetTrendPoint, mode: AssetTrendMode): number {
  if (mode === 'assets') return point.assetsMinor
  if (mode === 'liabilities') return point.liabilitiesMinor === 0 ? 0 : -point.liabilitiesMinor
  return point.netAssetsMinor
}

export function compareAssetMonth(point: AssetTrendPoint): AssetMonthComparison {
  const changeMinor = point.changeMinor
  const previousMinor = point.netAssetsMinor - changeMinor
  const percent =
    previousMinor === 0
      ? point.netAssetsMinor === 0
        ? 0
        : 100
      : (changeMinor / Math.abs(previousMinor)) * 100

  return {
    changeMinor,
    percent,
    direction: changeMinor > 0 ? 'increase' : changeMinor < 0 ? 'decrease' : 'unchanged',
  }
}

export function assetSharePercent(point: AssetTrendPoint): number {
  const total = Math.max(0, point.assetsMinor) + Math.max(0, point.liabilitiesMinor)
  if (total === 0) return 0
  return (Math.max(0, point.assetsMinor) / total) * 100
}

function parsePeriod(period: string): [number, number] {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period)
  if (!match) throw new Error(`月份必须使用 YYYY-MM 格式：${period}`)
  return [Number(match[1]), Number(match[2])]
}
