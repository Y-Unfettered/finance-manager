import type { AssetMonthlyDelta } from '@/db/repositories/statistics-repository'

import { buildAssetTrendPoints } from './statistics-service'

describe('buildAssetTrendPoints', () => {
  it('shows all months in range with accumulative values from the first record', () => {
    const points = buildAssetTrendPoints([delta('2026-08', 100_000, 20_000)], '2026-01', '2026-08')

    expect(points).toHaveLength(8)
    expect(points[0]).toMatchObject({ periodKey: '2026-01', netAssetsMinor: 0 })
    expect(points[7]).toMatchObject({
      periodKey: '2026-08',
      assetsMinor: 100_000,
      liabilitiesMinor: 20_000,
      netAssetsMinor: 80_000,
      changeMinor: 80_000,
    })
  })

  it('shows all months in range, only accumulating when deltas exist', () => {
    const points = buildAssetTrendPoints(
      [delta('2026-06', 100_000, 0), delta('2026-08', 10_000, 20_000)],
      '2026-01',
      '2026-08',
    )

    expect(points.map((point) => point.periodKey)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
      '2026-06', '2026-07', '2026-08',
    ])
    expect(points[0]).toMatchObject({ assetsMinor: 0, liabilitiesMinor: 0, netAssetsMinor: 0 })
    expect(points[5]).toMatchObject({ assetsMinor: 100_000, liabilitiesMinor: 0, netAssetsMinor: 100_000 })
    expect(points[6]).toMatchObject({ assetsMinor: 100_000, liabilitiesMinor: 0, netAssetsMinor: 100_000, changeMinor: 0 })
    expect(points.at(-1)).toMatchObject({
      assetsMinor: 110_000,
      liabilitiesMinor: 20_000,
      netAssetsMinor: 90_000,
      changeMinor: -10_000,
    })
  })

  it('returns no trend when the selected range predates all asset records', () => {
    expect(buildAssetTrendPoints([delta('2026-08', 100_000, 0)], '2025-01', '2025-12')).toEqual([])
  })

  it('returns no trend without real asset records', () => {
    expect(buildAssetTrendPoints([], '2026-01', '2026-08')).toEqual([])
  })
})

function delta(
  periodKey: string,
  assetDeltaMinor: number,
  liabilityDeltaMinor: number,
): AssetMonthlyDelta {
  return { periodKey, assetDeltaMinor, liabilityDeltaMinor }
}
