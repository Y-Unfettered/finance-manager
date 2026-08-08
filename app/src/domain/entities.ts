import type { AccountType, NormalBalance } from './accounts'
import type { CategoryKind, CurrencyCode, EntrySide, TransactionType } from './accounting'

export type BudgetPeriodType = 'monthly'

export interface BudgetRecord {
  id: string
  ledgerId: string
  periodType: BudgetPeriodType
  periodKey: string
  totalLimitMinor: number
  note?: string
  createdAt: string
  updatedAt: string
}

export interface CategoryBudgetRecord {
  id: string
  budgetId: string
  categoryId: string
  limitMinor: number
  createdAt: string
  updatedAt: string
}

export interface CategoryBudgetWithCategory extends CategoryBudgetRecord {
  categoryName: string
}

export interface BudgetWithProgress extends BudgetRecord {
  spentMinor: number
  remainingMinor: number
  overspent: boolean
  categoryBudgets: readonly CategoryBudgetProgress[]
}

export interface CategoryBudgetProgress extends CategoryBudgetWithCategory {
  spentMinor: number
  remainingMinor: number
  overspent: boolean
}

export type TransactionTemplateType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'credit_purchase'
  | 'repay_borrowing'
  | 'loan_out'
  | 'loan_recovery'

export interface TransactionTemplateRecord {
  id: string
  ledgerId: string
  name: string
  transactionType: TransactionTemplateType
  amountMinor: number
  categoryId?: string
  sourceAccountId?: string
  targetAccountId?: string
  merchant?: string
  note?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TransactionTemplateWithRefs extends TransactionTemplateRecord {
  categoryName?: string
  sourceAccountName?: string
  targetAccountName?: string
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly'

export interface RecurringTransactionRecord {
  id: string
  ledgerId: string
  templateId: string
  frequency: RecurringFrequency
  intervalValue: number
  nextOccurrenceAt: string
  endDate?: string
  lastExecutedAt?: string
  lastTransactionId?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface RecurringTransactionWithTemplate extends RecurringTransactionRecord {
  templateName: string
  transactionType: TransactionTemplateType
  amountMinor: number
}

export type ReminderType = 'credit_card_due' | 'prepaid_expiry' | 'receivable_due' | 'custom'

export interface ReminderRecord {
  id: string
  ledgerId: string
  type: ReminderType
  accountId?: string
  title: string
  dueDate: string
  amountMinor?: number
  advanceDays: number
  enabled: boolean
  lastTriggeredAt?: string
  createdAt: string
  updatedAt: string
}

export interface ReminderWithAccount extends ReminderRecord {
  accountName?: string
}

export interface UpcomingReminder {
  reminder: ReminderWithAccount
  daysUntilDue: number
  isAdvance: boolean
}

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
  counterparty?: string
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

export interface ReceivableRecord {
  id: string
  ledgerId: string
  accountId: string
  loanTransactionId: string
  borrower: string
  originalAmountMinor: number
  dueDate?: string
  note?: string
  status: 'open' | 'settled'
  createdAt: string
  updatedAt: string
}

export interface ReceivableBalanceRecord extends ReceivableRecord {
  outstandingMinor: number
}

export interface PayableRecord {
  id: string
  ledgerId: string
  accountId: string
  borrowTransactionId: string
  lender: string
  originalAmountMinor: number
  dueDate?: string
  note?: string
  status: 'open' | 'settled'
  createdAt: string
  updatedAt: string
}

export interface PayableBalanceRecord extends PayableRecord {
  outstandingMinor: number
}
