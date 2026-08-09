import type { AccountType } from '@/domain/accounts'
import type { AccountBalanceRecord } from '@/domain/entities'

export type AssetSectionId =
  'credit' | 'funds' | 'prepaid' | 'investment' | 'receivable' | 'other_liability'

export interface AssetSectionSummary {
  id: AssetSectionId
  label: string
  amountMinor: number
  count: number
  accountTypes: readonly AccountType[]
}

export interface AssetOverview {
  netAssetsMinor: number
  totalAssetsMinor: number
  totalLiabilitiesMinor: number
  borrowedMinor: number
  lentMinor: number
  assetCount: number
  liabilityCount: number
  liabilityRatio: number
  sections: readonly AssetSectionSummary[]
}

const SECTION_DEFINITIONS: readonly Omit<AssetSectionSummary, 'amountMinor' | 'count'>[] = [
  {
    id: 'credit',
    label: '信用卡',
    accountTypes: ['credit_card', 'consumer_credit'],
  },
  {
    id: 'funds',
    label: '资金',
    accountTypes: ['cash', 'bank', 'platform', 'restricted_asset'],
  },
  { id: 'prepaid', label: '充值', accountTypes: ['prepaid'] },
  { id: 'investment', label: '投资', accountTypes: ['investment'] },
  { id: 'receivable', label: '借出款', accountTypes: ['receivable'] },
  { id: 'other_liability', label: '借入款', accountTypes: ['other_liability'] },
]

export function summarizeAssets(accounts: readonly AccountBalanceRecord[]): AssetOverview {
  const active = accounts.filter(
    (account) => !account.archivedAt && account.includeInAssetStats !== false,
  )
  const assets = active.filter((account) => account.normalBalance === 'debit')
  const liabilities = active.filter((account) => account.normalBalance === 'credit')
  const totalAssetsMinor = sumBalances(assets)
  const totalLiabilitiesMinor = sumBalances(liabilities)

  return {
    netAssetsMinor: totalAssetsMinor - totalLiabilitiesMinor,
    totalAssetsMinor,
    totalLiabilitiesMinor,
    borrowedMinor: sumByTypes(active, ['other_liability']),
    lentMinor: sumByTypes(active, ['receivable']),
    assetCount: assets.filter(hasNonZeroBalance).length,
    liabilityCount: liabilities.filter(hasNonZeroBalance).length,
    liabilityRatio:
      totalAssetsMinor > 0 ? Math.max(0, totalLiabilitiesMinor / totalAssetsMinor) : 0,
    sections: SECTION_DEFINITIONS.map((section) => ({
      ...section,
      amountMinor: sumByTypes(active, section.accountTypes),
      count: active.filter(
        (account) => section.accountTypes.includes(account.type) && hasNonZeroBalance(account),
      ).length,
    })),
  }
}

function hasNonZeroBalance(account: AccountBalanceRecord): boolean {
  return account.balanceMinor !== 0
}

function sumBalances(accounts: readonly AccountBalanceRecord[]): number {
  return accounts.reduce((total, account) => total + account.balanceMinor, 0)
}

function sumByTypes(
  accounts: readonly AccountBalanceRecord[],
  types: readonly AccountType[],
): number {
  return accounts
    .filter((account) => types.includes(account.type))
    .reduce((total, account) => total + account.balanceMinor, 0)
}
