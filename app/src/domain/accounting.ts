import type { AccountPostingRef, NormalBalance } from './accounts'

export type CurrencyCode = 'CNY'
export type TransactionType = 'expense' | 'income' | 'transfer' | 'credit_purchase'
export type EntrySide = 'debit' | 'credit'
export type CategoryKind = 'expense' | 'income'

export interface CategoryPostingRef {
  id: string
  kind: CategoryKind
}

export type EntryTarget =
  { kind: 'account'; accountId: string } | { kind: 'category'; categoryId: string }

export interface EntryDraft {
  side: EntrySide
  amountMinor: number
  target: EntryTarget
}

export interface TransactionDraft {
  type: TransactionType
  amountMinor: number
  currency: CurrencyCode
  occurredAt: string
  merchant?: string
  note?: string
  entries: readonly EntryDraft[]
}

interface BaseCommand {
  amountMinor: number
  occurredAt: string
  merchant?: string
  note?: string
}

export interface ExpenseCommand extends BaseCommand {
  paymentAccount: AccountPostingRef
  category: CategoryPostingRef
}

export interface IncomeCommand extends BaseCommand {
  depositAccount: AccountPostingRef
  category: CategoryPostingRef
}

export interface TransferCommand extends BaseCommand {
  sourceAccount: AccountPostingRef
  targetAccount: AccountPostingRef
}

export interface CreditPurchaseCommand extends BaseCommand {
  liabilityAccount: AccountPostingRef
  category: CategoryPostingRef
}

export function createExpense(command: ExpenseCommand): TransactionDraft {
  assertAccount(command.paymentAccount, 'debit', 'paymentAccount')
  assertCategory(command.category, 'expense')

  return createDraft('expense', command, [
    categoryEntry(command.category.id, 'debit', command.amountMinor),
    accountEntry(command.paymentAccount.id, 'credit', command.amountMinor),
  ])
}

export function createIncome(command: IncomeCommand): TransactionDraft {
  assertAccount(command.depositAccount, 'debit', 'depositAccount')
  assertCategory(command.category, 'income')

  return createDraft('income', command, [
    accountEntry(command.depositAccount.id, 'debit', command.amountMinor),
    categoryEntry(command.category.id, 'credit', command.amountMinor),
  ])
}

export function createTransfer(command: TransferCommand): TransactionDraft {
  assertAccount(command.sourceAccount, 'debit', 'sourceAccount')
  assertAccount(command.targetAccount, 'debit', 'targetAccount')
  assertDifferentIds(command.sourceAccount.id, command.targetAccount.id)

  return createDraft('transfer', command, [
    accountEntry(command.targetAccount.id, 'debit', command.amountMinor),
    accountEntry(command.sourceAccount.id, 'credit', command.amountMinor),
  ])
}

export function createCreditPurchase(command: CreditPurchaseCommand): TransactionDraft {
  assertAccount(command.liabilityAccount, 'credit', 'liabilityAccount')
  assertCategory(command.category, 'expense')

  return createDraft('credit_purchase', command, [
    categoryEntry(command.category.id, 'debit', command.amountMinor),
    accountEntry(command.liabilityAccount.id, 'credit', command.amountMinor),
  ])
}

export function entryTotals(entries: readonly EntryDraft[]): {
  debitMinor: number
  creditMinor: number
} {
  return entries.reduce(
    (totals, entry) => {
      totals[entry.side === 'debit' ? 'debitMinor' : 'creditMinor'] += entry.amountMinor
      return totals
    },
    { debitMinor: 0, creditMinor: 0 },
  )
}

export function assertBalanced(entries: readonly EntryDraft[]): void {
  if (entries.length < 2) {
    throw new Error('A transaction requires at least two entries')
  }

  const totals = entryTotals(entries)
  if (totals.debitMinor !== totals.creditMinor) {
    throw new Error(
      `Unbalanced transaction: debit=${totals.debitMinor}, credit=${totals.creditMinor}`,
    )
  }
}

function createDraft(
  type: TransactionType,
  command: BaseCommand,
  entries: readonly EntryDraft[],
): TransactionDraft {
  assertPositiveMinorUnits(command.amountMinor)
  assertOccurredAt(command.occurredAt)
  assertBalanced(entries)

  return {
    type,
    amountMinor: command.amountMinor,
    currency: 'CNY',
    occurredAt: command.occurredAt,
    merchant: normalizeOptionalText(command.merchant),
    note: normalizeOptionalText(command.note),
    entries,
  }
}

function accountEntry(accountId: string, side: EntrySide, amountMinor: number): EntryDraft {
  assertId(accountId, 'accountId')
  return { side, amountMinor, target: { kind: 'account', accountId } }
}

function categoryEntry(categoryId: string, side: EntrySide, amountMinor: number): EntryDraft {
  assertId(categoryId, 'categoryId')
  return { side, amountMinor, target: { kind: 'category', categoryId } }
}

function assertAccount(
  account: AccountPostingRef,
  expectedBalance: NormalBalance,
  field: string,
): void {
  assertId(account.id, field)
  if (account.normalBalance !== expectedBalance) {
    throw new Error(`${field} must have a ${expectedBalance} normal balance`)
  }
}

function assertCategory(category: CategoryPostingRef, expectedKind: CategoryKind): void {
  assertId(category.id, 'category')
  if (category.kind !== expectedKind) {
    throw new Error(`Category must be ${expectedKind}`)
  }
}

function assertPositiveMinorUnits(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('amountMinor must be a positive safe integer')
  }
}

function assertOccurredAt(value: string): void {
  if (value.trim() === '' || Number.isNaN(Date.parse(value))) {
    throw new Error('occurredAt must be a valid ISO date-time')
  }
}

function assertId(value: string, field: string): void {
  if (value.trim() === '') {
    throw new Error(`${field} is required`)
  }
}

function assertDifferentIds(sourceId: string, targetId: string): void {
  if (sourceId === targetId) {
    throw new Error('Transfer accounts must be different')
  }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}
