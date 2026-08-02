export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'platform',
  'restricted_asset',
  'prepaid',
  'investment',
  'receivable',
  'credit_card',
  'consumer_credit',
  'other_liability',
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]
export type NormalBalance = 'debit' | 'credit'

const LIABILITY_TYPES: ReadonlySet<AccountType> = new Set([
  'credit_card',
  'consumer_credit',
  'other_liability',
])

export function normalBalanceForAccountType(type: AccountType): NormalBalance {
  return LIABILITY_TYPES.has(type) ? 'credit' : 'debit'
}

export interface AccountPostingRef {
  id: string
  type: AccountType
  normalBalance: NormalBalance
}
