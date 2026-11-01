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
  /** 捕获来源（如 "accessibility"），自动记账落库用 */
  captureSource?: string
  /** 解析器版本（如 "0.1.0"），自动记账落库用 */
  parserVersion?: string
  /** 置信度（0~1），自动记账落库用 */
  confidence?: number
  /** 捕获指纹（自动记账防重：随账单数据持久化） */
  fingerprint?: string
  entries: readonly EntryDraft[]
}

interface BaseCommand {
  amountMinor: number
  occurredAt: string
  merchant?: string
  counterparty?: string
  note?: string
  captureSource?: string
  parserVersion?: string
  confidence?: number
  /** 捕获指纹（自动记账防重：随账单数据持久化） */
  fingerprint?: string
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
  originalAmountMinor?: number
  discountMinor?: number
  discountIncomeCategory?: CategoryPostingRef
  /** 手续费（如微信提现服务费）：转出 amountMinor 中被扣掉的部分，记入费用分类 */
  feeMinor?: number
  feeCategory?: CategoryPostingRef
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
  originalAmountMinor?: number
  discountMinor?: number
  discountIncomeCategory?: CategoryPostingRef
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
  assertAccount(command.targetAccount, 'debit', 'targetAccount')
  assertDifferentIds(command.sourceAccount.id, command.targetAccount.id)

  const discountIncomeCategory = command.discountIncomeCategory
  const originalAmountMinor = command.originalAmountMinor
  const discountMinor = command.discountMinor

  // 手续费分支（如微信提现服务费）：转出申请额 = 实到 + 手续费
  // 分录：转入 debit 实到、转出 credit 申请额、手续费分类 debit 手续费
  const feeMinor = command.feeMinor
  const feeCategory = command.feeCategory
  if (feeMinor !== undefined && feeMinor > 0) {
    if (feeCategory === undefined) {
      throw new Error('手续费需要费用分类')
    }
    assertCategory(feeCategory, 'expense')
    assertId(feeCategory.id, 'feeCategory')
    if (originalAmountMinor === undefined) {
      throw new Error('手续费需要转出申请金额')
    }
    if (originalAmountMinor - feeMinor !== command.amountMinor) {
      throw new Error('手续费金额与实际到账不一致')
    }
    return createDraft('transfer', command, [
      accountEntry(command.targetAccount.id, 'debit', command.amountMinor),
      accountEntry(command.sourceAccount.id, 'credit', originalAmountMinor),
      categoryEntry(feeCategory.id, 'debit', feeMinor),
    ])
  }

  if (
    discountIncomeCategory !== undefined &&
    originalAmountMinor !== undefined &&
    discountMinor !== undefined
  ) {
    assertCategory(discountIncomeCategory, 'income')
    assertId(discountIncomeCategory.id, 'discountIncomeCategory')
    if (command.amountMinor + discountMinor !== originalAmountMinor) {
      throw new Error('转账优惠金额与实际支出不一致')
    }
    return createDraft('transfer', command, [
      accountEntry(command.targetAccount.id, 'debit', originalAmountMinor),
      accountEntry(command.sourceAccount.id, 'credit', command.amountMinor),
      categoryEntry(discountIncomeCategory.id, 'credit', discountMinor),
    ])
  }

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

  const discountIncomeCategory = command.discountIncomeCategory
  const originalAmountMinor = command.originalAmountMinor
  const discountMinor = command.discountMinor

  if (
    discountIncomeCategory !== undefined &&
    originalAmountMinor !== undefined &&
    discountMinor !== undefined
  ) {
    assertCategory(discountIncomeCategory, 'income')
    assertId(discountIncomeCategory.id, 'discountIncomeCategory')
    if (command.amountMinor + discountMinor !== originalAmountMinor) {
      throw new Error('还款优惠金额与实际支出不一致')
    }
    return createDraft('repayment', command, [
      accountEntry(command.liabilityAccount.id, 'debit', originalAmountMinor),
      accountEntry(command.sourceAccount.id, 'credit', command.amountMinor),
      categoryEntry(discountIncomeCategory.id, 'credit', discountMinor),
    ])
  }

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
    throw new Error('一笔交易至少需要两个分录')
  }

  const totals = entryTotals(entries)
  if (totals.debitMinor !== totals.creditMinor) {
    throw new Error(
      `借贷不平衡：借方=${totals.debitMinor}，贷方=${totals.creditMinor}`,
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
    captureSource: normalizeOptionalText(command.captureSource),
    parserVersion: normalizeOptionalText(command.parserVersion),
    confidence: command.confidence,
    fingerprint: normalizeOptionalText(command.fingerprint),
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

const FIELD_NAMES: Record<string, string> = {
  paymentAccount: '支付账户',
  depositAccount: '收款账户',
  targetAccount: '目标账户',
  liabilityAccount: '负债账户',
  sourceAccount: '来源账户',
  receivableAccount: '应收账户',
  payableAccount: '应付账户',
  refundAccount: '退款账户',
  categoryId: '分类',
  accountId: '账户',
}

const BALANCE_NAMES: Record<NormalBalance, string> = {
  debit: '借方',
  credit: '贷方',
}

function assertAccount(
  account: AccountPostingRef,
  expectedBalance: NormalBalance,
  field: string,
): void {
  assertId(account.id, field)
  if (account.normalBalance !== expectedBalance) {
    throw new Error(
      `${FIELD_NAMES[field] ?? field}不匹配：应使用${BALANCE_NAMES[expectedBalance]}账户`,
    )
  }
}

function assertCategory(category: CategoryPostingRef, expectedKind: CategoryKind): void {
  assertId(category.id, 'category')
  if (category.kind !== expectedKind) {
    throw new Error(`分类类型不匹配：应为${expectedKind === 'expense' ? '支出' : '收入'}分类`)
  }
}

function assertPositiveMinorUnits(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('金额必须为正整数（分）')
  }
}

function assertOccurredAt(value: string): void {
  if (value.trim() === '' || Number.isNaN(Date.parse(value))) {
    throw new Error('交易日期必须为有效的 ISO 日期时间')
  }
}

function assertId(value: string, field: string): void {
  if (value.trim() === '') {
    throw new Error(`${FIELD_NAMES[field] ?? field}不能为空`)
  }
}

function assertDifferentIds(sourceId: string, targetId: string): void {
  if (sourceId === targetId) {
    throw new Error('转账的转出和转入账户不能相同')
  }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}
