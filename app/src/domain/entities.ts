import type { AccountType, NormalBalance } from './accounts'
import type { CategoryKind, CurrencyCode, EntrySide, TransactionType } from './accounting'

export interface LedgerRecord {
  id: string
  name: string
  baseCurrency: CurrencyCode
  periodStartDay: number
  createdAt: string
  updatedAt: string
}

export interface AccountRecord {
  id: string
  ledgerId: string
  name: string
  type: AccountType
  normalBalance: NormalBalance
  currency: CurrencyCode
  institution?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AccountBalanceRecord extends AccountRecord {
  balanceMinor: number
}

export interface CategoryRecord {
  id: string
  ledgerId: string
  parentId?: string
  kind: CategoryKind
  name: string
  sortOrder: number
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

export interface StoredTransaction {
  id: string
  ledgerId: string
  type: TransactionType
  status: 'posted' | 'void'
  amountMinor: number
  currency: CurrencyCode
  occurredAt: string
  merchant?: string
  note?: string
  createdAt: string
  updatedAt: string
}

export interface StoredEntry {
  id: string
  ledgerId: string
  transactionId: string
  accountId?: string
  categoryId?: string
  side: EntrySide
  amountMinor: number
  createdAt: string
}

export interface TransactionWithEntries extends StoredTransaction {
  entries: readonly StoredEntry[]
}
