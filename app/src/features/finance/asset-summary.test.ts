import type { AccountBalanceRecord } from '@/domain/entities'

import { summarizeAssets } from './asset-summary'

describe('summarizeAssets', () => {
  it('calculates net assets, borrow directions and account sections', () => {
    const overview = summarizeAssets([
      account('cash', 'cash', 'debit', 50_000),
      account('bank', 'bank', 'debit', 250_000),
      account('stock', 'investment', 'debit', 100_000),
      account('lent', 'receivable', 'debit', 80_000),
      account('card', 'credit_card', 'credit', 30_000),
      account('loan', 'other_liability', 'credit', 20_000),
    ])

    expect(overview).toMatchObject({
      totalAssetsMinor: 480_000,
      totalLiabilitiesMinor: 50_000,
      netAssetsMinor: 430_000,
      borrowedMinor: 20_000,
      lentMinor: 80_000,
      assetCount: 4,
      liabilityCount: 2,
    })
    expect(overview.liabilityRatio).toBeCloseTo(50_000 / 480_000)
    expect(overview.sections.find((section) => section.id === 'funds')).toMatchObject({
      amountMinor: 300_000,
      count: 2,
    })
    expect(overview.sections.find((section) => section.id === 'credit')).toMatchObject({
      amountMinor: 30_000,
      count: 1,
    })
  })

  it('excludes archived accounts and accounts disabled for asset statistics', () => {
    const archived = account('archived', 'bank', 'debit', 80_000)
    archived.archivedAt = '2026-08-04T00:00:00.000Z'
    const excluded = account('excluded', 'cash', 'debit', 60_000)
    excluded.includeInAssetStats = false

    const overview = summarizeAssets([
      account('included', 'cash', 'debit', 40_000),
      archived,
      excluded,
    ])

    expect(overview.totalAssetsMinor).toBe(40_000)
    expect(overview.assetCount).toBe(1)
    expect(overview.sections.find((section) => section.id === 'funds')).toMatchObject({
      amountMinor: 40_000,
      count: 1,
    })
  })
})

function account(
  id: string,
  type: AccountBalanceRecord['type'],
  normalBalance: AccountBalanceRecord['normalBalance'],
  balanceMinor: number,
): AccountBalanceRecord {
  return {
    id,
    ledgerId: 'ledger',
    name: id,
    type,
    normalBalance,
    currency: 'CNY',
    balanceMinor,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
  }
}
