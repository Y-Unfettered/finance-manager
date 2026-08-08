import type { AccountPostingRef, NormalBalance } from './accounts'

export type CurrencyCode = 'CNY'
export type TransactionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'credit_purchase'
  | 'repayment'
  | 'refund'
  | 'loan_out'
  | 'loan_recovery'
  | 'borrowing'
  | 'repay_borrowing'
  | 'balance_adjustment'
  | 'opening_balance'
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
  counterparty?: string
  note?: string
  entries: readonly EntryDraft[]
}

interface BaseCommand {
  amountMinor: number
  occurredAt: string
  merchant?: string
  counterparty?: string
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

export interface CreditIncomeCommand extends BaseCommand {
  /** 负债类账户（如信用卡、借入款），收入会减少其负债余额。 */
  liabilityAccount: AccountPostingRef
  category: CategoryPostingRef
}

export interface RepaymentCommand extends BaseCommand {
  sourceAccount: AccountPostingRef
  liabilityAccount: AccountPostingRef
}

export interface RefundCommand extends BaseCommand {
  refundAccount: AccountPostingRef
  category: CategoryPostingRef
}

export interface AccountBalanceCommand extends BaseCommand {
  account: AccountPostingRef
  offsetCategory: CategoryPostingRef
  increase: boolean
}

export interface LoanOutCommand extends BaseCommand {
  sourceAccount: AccountPostingRef
  receivableAccount: AccountPostingRef
}

export interface LoanRecoveryCommand extends BaseCommand {
  receivableAccount: AccountPostingRef
  depositAccount: AccountPostingRef
}

export interface BorrowingCommand extends BaseCommand {
  payableAccount: AccountPostingRef
  depositAccount: AccountPostingRef
}

export interface RepayBorrowingCommand extends BaseCommand {
  payableAccount: AccountPostingRef
  sourceAccount: AccountPostingRef
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

/**
 * 信用卡/负债账户的"收入"交易（如信用卡退款、返现、借入款核销）。
 * 会计分录：借负债账户（减少负债）+ 贷收入分类（增加收入）。
 * 复用 `refund` 类型以与现有的"退款"语义保持一致。
 */
export function createCreditIncome(command: CreditIncomeCommand): TransactionDraft {
  assertAccount(command.liabilityAccount, 'credit', 'liabilityAccount')
  assertCategory(command.category, 'income')

  return createDraft('refund', command, [
    accountEntry(command.liabilityAccount.id, 'debit', command.amountMinor),
    categoryEntry(command.category.id, 'credit', command.amountMinor),
  ])
}

export function createRepayment(command: RepaymentCommand): TransactionDraft {
  assertAccount(command.sourceAccount, 'debit', 'sourceAccount')
  assertAccount(command.liabilityAccount, 'credit', 'liabilityAccount')
  assertDifferentIds(command.sourceAccount.id, command.liabilityAccount.id)

  return createDraft('repayment', command, [
    accountEntry(command.liabilityAccount.id, 'debit', command.amountMinor),
    accountEntry(command.sourceAccount.id, 'credit', command.amountMinor),
  ])
}

/**
 * 退款冲减原支出：退款账户增加（或信用账户负债减少），原支出分类减少。
 */
export function createRefund(command: RefundCommand): TransactionDraft {
  assertId(command.refundAccount.id, 'refundAccount')
  assertCategory(command.category, 'expense')

  return createDraft('refund', command, [
    accountEntry(command.refundAccount.id, 'debit', command.amountMinor),
    categoryEntry(command.category.id, 'credit', command.amountMinor),
  ])
}

export function createOpeningBalance(command: AccountBalanceCommand): TransactionDraft {
  return createDraft(
    'opening_balance',
    command,
    balanceChangeEntries(command.account, command.offsetCategory, command.amountMinor, true),
  )
}

export function createBalanceAdjustment(command: AccountBalanceCommand): TransactionDraft {
  return createDraft(
    'balance_adjustment',
    command,
    balanceChangeEntries(
      command.account,
      command.offsetCategory,
      command.amountMinor,
      command.increase,
    ),
  )
}

export function createLoanOut(command: LoanOutCommand): TransactionDraft {
  assertAccount(command.sourceAccount, 'debit', 'sourceAccount')
  assertAccount(command.receivableAccount, 'debit', 'receivableAccount')
  assertDifferentIds(command.sourceAccount.id, command.receivableAccount.id)
  return createDraft('loan_out', command, [
    accountEntry(command.receivableAccount.id, 'debit', command.amountMinor),
    accountEntry(command.sourceAccount.id, 'credit', command.amountMinor),
  ])
}

export function createLoanRecovery(command: LoanRecoveryCommand): TransactionDraft {
  assertAccount(command.receivableAccount, 'debit', 'receivableAccount')
  assertAccount(command.depositAccount, 'debit', 'depositAccount')
  assertDifferentIds(command.receivableAccount.id, command.depositAccount.id)
  return createDraft('loan_recovery', command, [
    accountEntry(command.depositAccount.id, 'debit', command.amountMinor),
    accountEntry(command.receivableAccount.id, 'credit', command.amountMinor),
  ])
}

export function createBorrowing(command: BorrowingCommand): TransactionDraft {
  assertAccount(command.payableAccount, 'credit', 'payableAccount')
  assertAccount(command.depositAccount, 'debit', 'depositAccount')
  assertDifferentIds(command.payableAccount.id, command.depositAccount.id)
  return createDraft('borrowing', command, [
    accountEntry(command.depositAccount.id, 'debit', command.amountMinor),
    accountEntry(command.payableAccount.id, 'credit', command.amountMinor),
  ])
}

export function createRepayBorrowing(command: RepayBorrowingCommand): TransactionDraft {
  assertAccount(command.payableAccount, 'credit', 'payableAccount')
  assertAccount(command.sourceAccount, 'debit', 'sourceAccount')
  assertDifferentIds(command.payableAccount.id, command.sourceAccount.id)
  return createDraft('repay_borrowing', command, [
    accountEntry(command.payableAccount.id, 'debit', command.amountMinor),
    accountEntry(command.sourceAccount.id, 'credit', command.amountMinor),
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
    counterparty: normalizeOptionalText(command.counterparty),
    note: normalizeOptionalText(command.note),
    entries,
  }
}

function balanceChangeEntries(
  account: AccountPostingRef,
  category: CategoryPostingRef,
  amountMinor: number,
  increase: boolean,
): readonly EntryDraft[] {
  const accountSide: EntrySide = increase
    ? account.normalBalance
    : account.normalBalance === 'debit'
      ? 'credit'
      : 'debit'
  const offsetSide: EntrySide = accountSide === 'debit' ? 'credit' : 'debit'
  return [
    accountEntry(account.id, accountSide, amountMinor),
    categoryEntry(category.id, offsetSide, amountMinor),
  ]
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
