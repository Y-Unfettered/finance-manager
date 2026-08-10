import type { AssetTrendPoint } from './statistics-service'
import {
  assetSharePercent,
  assetTrendValueMinor,
  compareAssetMonth,
  fillAssetTrendPoints,
} from './asset-statistics-presentation'

describe('asset statistics presentation', () => {
  it('fills missing months with zero and stops at the supplied current-month boundary', () => {
    const august = point('2026-08', 4_767_318, 34_318, -30_503_879)
    const filled = fillAssetTrendPoints([august], '2026-01', '2026-08')

    expect(filled).toHaveLength(8)
    expect(filled[4]).toEqual(point('2026-05', 0, 0, 0))
    expect(filled.at(-1)).toEqual(august)
  })

  it('shows liabilities below zero only in the presentation layer', () => {
    const value = point('2026-08', 100_000, 34_318, 0)
    expect(assetTrendValueMinor(value, 'assets')).toBe(100_000)
    expect(assetTrendValueMinor(value, 'liabilities')).toBe(-34_318)
    expect(value.liabilitiesMinor).toBe(34_318)
  })

  it('calculates competitor-style monthly comparison and balance bar share', () => {
    const august = point('2026-08', 4_767_318, 34_318, -30_503_879)
    expect(compareAssetMonth(august)).toMatchObject({
      changeMinor: -30_503_879,
      direction: 'decrease',
    })
    expect(compareAssetMonth(august).percent).toBeCloseTo(-86.6, 1)
    expect(assetSharePercent(august)).toBeCloseTo(99.285, 2)
  })
})

function point(
  periodKey: string,
  assetsMinor: number,
  liabilitiesMinor: number,
  changeMinor: number,
): AssetTrendPoint {
  return {
    periodKey,
    assetsMinor,
    liabilitiesMinor,
    netAssetsMinor: assetsMinor - liabilitiesMinor,
    changeMinor,
  }
}
