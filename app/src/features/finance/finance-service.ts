import { inject, type InjectionKey } from 'vue'

import {
  createBalanceAdjustment,
  createBorrowing,
  createExpense,
  createIncome,
  createLoanOut,
  createLoanRecovery,
  createOpeningBalance,
  createRepayBorrowing,
  createTransfer,
  type CategoryKind,
  type CategoryPostingRef,
  type TransactionType,
} from '@/domain/accounting'
import { normalBalanceForAccountType, type AccountType } from '@/domain/accounts'
import type {
  AccountBalanceRecord,
  AccountRecord,
  CategoryRecord,
  PayableBalanceRecord,
  PayableRecord,
  ReceivableBalanceRecord,
  ReceivableRecord,
} from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import { AccountRepository } from '@/db/repositories/account-repository'
import { CategoryRepository } from '@/db/repositories/category-repository'
import {
  DashboardRepository,
  type LedgerListItem,
  type MonthlySummary,
} from '@/db/repositories/dashboard-repository'
import { TransactionRepository } from '@/db/repositories/transaction-repository'
import type { AccountActivityRecord } from '@/db/repositories/transaction-repository'
import { PayableRepository } from '@/db/repositories/payable-repository'
import { ReceivableRepository } from '@/db/repositories/receivable-repository'

export type { LedgerListItem }

export interface HomeSnapshot {
  monthLabel: string
  summary: MonthlySummary
  transactions: readonly LedgerListItem[]
}

export interface CreateAccountInput {
  ledgerId: string
  name: string
  type: AccountType
  institution?: string
  initialBalanceMinor?: number
  occurredAt?: string
}

export interface CreateExpenseInput {
  ledgerId: string
  amountMinor: number
  accountId: string
  categoryId: string
  occurredAt: string
  merchant?: string
  note?: string
}

export interface CreateIncomeInput {
  ledgerId: string
  amountMinor: number
  accountId: string
  categoryId: string
  occurredAt: string
  merchant?: string
  note?: string
}

export interface CreateTransferInput {
  ledgerId: string
  amountMinor: number
  sourceAccountId: string
  targetAccountId: string
  occurredAt: string
  note?: string
}

export interface ExpenseCategoryOption extends CategoryPostingRef {
  name: string
}

export interface IncomeCategoryOption extends CategoryPostingRef {
  name: string
}

export interface AdjustAccountBalanceInput {
  ledgerId: string
  accountId: string
  balanceMinor: number
  occurredAt: string
  note?: string
}

export interface RenameAccountInput {
  ledgerId: string
  accountId: string
  name: string
}

export interface CreateReceivableInput {
  ledgerId: string
  borrower: string
  amountMinor: number
  sourceAccountId: string
  occurredAt: string
  dueDate?: string
  note?: string
}

export interface RecoverReceivableInput {
  receivableId: string
  amountMinor: number
  depositAccountId: string
  occurredAt: string
  note?: string
}

export interface UpdateReceivableInput {
  ledgerId: string
  receivableId: string
  dueDate?: string
  note?: string
}

export interface CreatePayableInput {
  ledgerId: string
  lender: string
  amountMinor: number
  depositAccountId: string
  occurredAt: string
  dueDate?: string
  note?: string
}

export interface RepayPayableInput {
  payableId: string
  amountMinor: number
  sourceAccountId: string
  occurredAt: string
  note?: string
}

export interface UpdatePayableInput {
  ledgerId: string
  payableId: string
  dueDate?: string
  note?: string
}

export interface EditTransactionInput {
  ledgerId: string
  transactionId: string
  occurredAt?: string
  merchant?: string
  note?: string
}

export interface EditTransactionFullInput {
  ledgerId: string
  transactionId: string
  type: 'expense' | 'income'
  amountMinor: number
  accountId: string
  categoryId: string
  occurredAt: string
  merchant?: string
  note?: string
}

export interface TransactionMetadata {
  id: string
  ledgerId: string
  type: TransactionType
  status: 'posted' | 'void'
  amountMinor: number
  occurredAt: string
  createdAt: string
  merchant?: string
  note?: string
  categoryId?: string
  categoryName?: string
  accountId?: string
  accountName?: string
}

export interface FinanceServicePort {
  loadHome(ledgerId: string, month: Date): Promise<HomeSnapshot>
  listAccounts(ledgerId: string): Promise<AccountBalanceRecord[]>
  getAccount(accountId: string): Promise<AccountBalanceRecord | undefined>
  listAccountActivity(accountId: string): Promise<AccountActivityRecord[]>
  listExpenseCategories(ledgerId: string): Promise<ExpenseCategoryOption[]>
  listIncomeCategories(ledgerId: string): Promise<IncomeCategoryOption[]>
  createExpenseCategory(ledgerId: string, name: string): Promise<string>
  createIncomeCategory(ledgerId: string, name: string): Promise<string>
  createAccount(input: CreateAccountInput): Promise<AccountRecord>
  adjustAccountBalance(input: AdjustAccountBalanceInput): Promise<void>
  renameAccount(input: RenameAccountInput): Promise<void>
  archiveAccount(ledgerId: string, accountId: string): Promise<void>
  unarchiveAccount(ledgerId: string, accountId: string): Promise<void>
  listReceivables(ledgerId: string): Promise<ReceivableBalanceRecord[]>
  createReceivable(input: CreateReceivableInput): Promise<ReceivableRecord>
  recoverReceivable(input: RecoverReceivableInput): Promise<void>
  updateReceivable(input: UpdateReceivableInput): Promise<void>
  deleteReceivable(ledgerId: string, receivableId: string): Promise<void>
  listPayables(ledgerId: string): Promise<PayableBalanceRecord[]>
  createPayable(input: CreatePayableInput): Promise<PayableRecord>
  repayPayable(input: RepayPayableInput): Promise<void>
  updatePayable(input: UpdatePayableInput): Promise<void>
  deletePayable(ledgerId: string, payableId: string): Promise<void>
  createExpense(input: CreateExpenseInput): Promise<string>
  createIncome(input: CreateIncomeInput): Promise<string>
  createTransfer(input: CreateTransferInput): Promise<string>
  listRecentTransactions(ledgerId: string, limit: number): Promise<LedgerListItem[]>
  voidTransaction(ledgerId: string, transactionId: string): Promise<void>
  editTransaction(input: EditTransactionInput): Promise<void>
  editTransactionFull(input: EditTransactionFullInput): Promise<string>
  getTransaction(transactionId: string): Promise<TransactionMetadata | undefined>
}

export const financeServiceKey: InjectionKey<FinanceServicePort> = Symbol('financeService')

export class FinanceService implements FinanceServicePort {
  private readonly accounts: AccountRepository
  private readonly categories: CategoryRepository
  private readonly dashboard: DashboardRepository
  private readonly transactions: TransactionRepository
  private readonly receivables: ReceivableRepository
  private readonly payables: PayableRepository

  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.accounts = new AccountRepository(database)
    this.categories = new CategoryRepository(database)
    this.dashboard = new DashboardRepository(database)
    this.transactions = new TransactionRepository(database, ids, clock)
    this.receivables = new ReceivableRepository(database)
    this.payables = new PayableRepository(database)
  }

  async loadHome(ledgerId: string, month: Date): Promise<HomeSnapshot> {
    const range = localMonthUtcRange(month)
    const [summary, transactions] = await Promise.all([
      this.dashboard.getMonthlySummary(ledgerId, range.startUtc, range.endUtc),
      this.dashboard.listMonthlyTransactions(ledgerId, range.startUtc, range.endUtc),
    ])
    return {
      monthLabel: `${month.getFullYear()}年${month.getMonth() + 1}月`,
      summary,
      transactions,
    }
  }

  listAccounts(ledgerId: string): Promise<AccountBalanceRecord[]> {
    return this.accounts.listBalances(ledgerId)
  }

  getAccount(accountId: string): Promise<AccountBalanceRecord | undefined> {
    return this.accounts.findBalance(accountId)
  }

  listAccountActivity(accountId: string): Promise<AccountActivityRecord[]> {
    return this.transactions.listByAccount(accountId)
  }

  async listExpenseCategories(ledgerId: string): Promise<ExpenseCategoryOption[]> {
    const categories = await this.categories.listByLedger(ledgerId)
    return categories
      .filter((category) => category.kind === 'expense' && !category.archivedAt)
      .map(({ id, kind, name }) => ({ id, kind, name }))
  }

  async listIncomeCategories(ledgerId: string): Promise<IncomeCategoryOption[]> {
    const categories = await this.categories.listByLedger(ledgerId)
    return categories
      .filter((category) => category.kind === 'income' && !category.archivedAt)
      .map(({ id, kind, name }) => ({ id, kind, name }))
  }

  async createExpenseCategory(ledgerId: string, name: string): Promise<string> {
    const trimmed = requiredText(name, '请输入分类名称')
    const existing = await this.categories.findByName(ledgerId, trimmed)
    if (existing && existing.kind === 'expense') return existing.id
    const id = this.ids.next('category')
    const now = this.clock.nowIso()
    const kind: CategoryKind = 'expense'
    await this.categories.create({
      id,
      ledgerId,
      kind,
      name: trimmed,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async createIncomeCategory(ledgerId: string, name: string): Promise<string> {
    const trimmed = requiredText(name, '请输入分类名称')
    const existing = await this.categories.findByName(ledgerId, trimmed)
    if (existing && existing.kind === 'income') return existing.id
    const id = this.ids.next('category')
    const now = this.clock.nowIso()
    const kind: CategoryKind = 'income'
    await this.categories.create({
      id,
      ledgerId,
      kind,
      name: trimmed,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async createAccount(input: CreateAccountInput): Promise<AccountRecord> {
    const now = this.clock.nowIso()
    const initialBalanceMinor = input.initialBalanceMinor ?? 0
    assertNonNegativeMinorUnits(initialBalanceMinor, '期初余额')
    const record: AccountRecord = {
      id: this.ids.next('account'),
      ledgerId: input.ledgerId,
      name: requiredText(input.name, '请输入账户名称'),
      type: input.type,
      normalBalance: normalBalanceForAccountType(input.type),
      currency: 'CNY',
      institution: optionalText(input.institution),
      createdAt: now,
      updatedAt: now,
    }
    await this.accounts.create(record)
    if (initialBalanceMinor > 0) {
      const offsetCategory = await this.ensureBalanceOffsetCategory(input.ledgerId)
      await this.transactions.create(
        input.ledgerId,
        createOpeningBalance({
          amountMinor: initialBalanceMinor,
          occurredAt: input.occurredAt ?? now,
          account: record,
          offsetCategory,
          increase: true,
          note: '创建账户时录入',
        }),
      )
    }
    return record
  }

  async adjustAccountBalance(input: AdjustAccountBalanceInput): Promise<void> {
    assertNonNegativeMinorUnits(input.balanceMinor, '账户余额')
    const account = await this.accounts.findBalance(input.accountId)
    if (!account || account.ledgerId !== input.ledgerId) throw new Error('账户不存在')
    const difference = input.balanceMinor - account.balanceMinor
    if (difference === 0) return
    const offsetCategory = await this.ensureBalanceOffsetCategory(input.ledgerId)
    await this.transactions.create(
      input.ledgerId,
      createBalanceAdjustment({
        amountMinor: Math.abs(difference),
        occurredAt: input.occurredAt,
        account,
        offsetCategory,
        increase: difference > 0,
        note: input.note,
      }),
    )
  }

  async renameAccount(input: RenameAccountInput): Promise<void> {
    const name = requiredText(input.name, '请输入账户名称')
    const account = await this.accounts.findBalance(input.accountId)
    if (!account || account.ledgerId !== input.ledgerId) throw new Error('账户不存在')
    await this.accounts.rename(input.accountId, name, this.clock.nowIso())
  }

  async archiveAccount(ledgerId: string, accountId: string): Promise<void> {
    const account = await this.accounts.findBalance(accountId)
    if (!account || account.ledgerId !== ledgerId) throw new Error('账户不存在')
    if (account.balanceMinor !== 0) {
      throw new Error('账户余额非零，请先调整余额或转账后再归档')
    }
    await this.accounts.archive(accountId, this.clock.nowIso())
  }

  async unarchiveAccount(ledgerId: string, accountId: string): Promise<void> {
    const account = await this.accounts.findBalance(accountId)
    if (!account || account.ledgerId !== ledgerId) throw new Error('账户不存在')
    await this.accounts.unarchive(accountId, this.clock.nowIso())
  }

  listReceivables(ledgerId: string): Promise<ReceivableBalanceRecord[]> {
    return this.receivables.listByLedger(ledgerId)
  }

  async createReceivable(input: CreateReceivableInput): Promise<ReceivableRecord> {
    assertPositiveMinorUnits(input.amountMinor, '借出金额')
    const borrower = requiredText(input.borrower, '请输入借款人或借出事项')
    const sourceAccount = await this.accounts.findPostingRef(input.sourceAccountId)
    if (!sourceAccount || sourceAccount.normalBalance !== 'debit') {
      throw new Error('请选择有效的资金账户')
    }
    const now = this.clock.nowIso()
    const receivableId = this.ids.next('receivable')
    const account: AccountRecord = {
      id: this.ids.next('account'),
      ledgerId: input.ledgerId,
      name: `借出款 · ${borrower} · ${receivableId.slice(-6)}`,
      type: 'receivable',
      normalBalance: 'debit',
      currency: 'CNY',
      institution: borrower,
      createdAt: now,
      updatedAt: now,
    }
    await this.accounts.create(account)
    const transaction = await this.transactions.create(
      input.ledgerId,
      createLoanOut({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        sourceAccount,
        receivableAccount: account,
        counterparty: borrower,
        note: input.note,
      }),
    )
    const record: ReceivableRecord = {
      id: receivableId,
      ledgerId: input.ledgerId,
      accountId: account.id,
      loanTransactionId: transaction.id,
      borrower,
      originalAmountMinor: input.amountMinor,
      dueDate: optionalText(input.dueDate),
      note: optionalText(input.note),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    }
    await this.receivables.create(record)
    return record
  }

  async recoverReceivable(input: RecoverReceivableInput): Promise<void> {
    assertPositiveMinorUnits(input.amountMinor, '还款金额')
    const receivable = await this.receivables.findById(input.receivableId)
    if (!receivable || receivable.status === 'settled') throw new Error('借出款不存在或已结清')
    if (input.amountMinor > receivable.outstandingMinor) throw new Error('还款金额不能超过待收金额')
    const [receivableAccount, depositAccount] = await Promise.all([
      this.accounts.findPostingRef(receivable.accountId),
      this.accounts.findPostingRef(input.depositAccountId),
    ])
    if (!receivableAccount || !depositAccount) throw new Error('收款账户不存在')
    await this.transactions.create(
      receivable.ledgerId,
      createLoanRecovery({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        receivableAccount,
        depositAccount,
        counterparty: receivable.borrower,
        note: input.note,
      }),
    )
    if (input.amountMinor === receivable.outstandingMinor) {
      await this.receivables.markSettled(receivable.id, this.clock.nowIso())
    }
  }

  async updateReceivable(input: UpdateReceivableInput): Promise<void> {
    const receivable = await this.receivables.findById(input.receivableId)
    if (!receivable || receivable.ledgerId !== input.ledgerId) {
      throw new Error('借出款不存在')
    }
    await this.receivables.update(
      input.receivableId,
      { dueDate: input.dueDate, note: input.note },
      this.clock.nowIso(),
    )
  }

  async deleteReceivable(ledgerId: string, receivableId: string): Promise<void> {
    const receivable = await this.receivables.findById(receivableId)
    if (!receivable || receivable.ledgerId !== ledgerId) {
      throw new Error('借出款不存在')
    }
    if (receivable.status !== 'settled') {
      throw new Error('仅可删除已结清的借出款')
    }
    await this.receivables.delete(receivableId)
  }

  listPayables(ledgerId: string): Promise<PayableBalanceRecord[]> {
    return this.payables.listByLedger(ledgerId)
  }

  async createPayable(input: CreatePayableInput): Promise<PayableRecord> {
    assertPositiveMinorUnits(input.amountMinor, '借入金额')
    const lender = requiredText(input.lender, '请输入债权人或借入事项')
    const depositAccount = await this.accounts.findPostingRef(input.depositAccountId)
    if (!depositAccount || depositAccount.normalBalance !== 'debit') {
      throw new Error('请选择有效的资金账户')
    }
    const now = this.clock.nowIso()
    const payableId = this.ids.next('payable')
    const account: AccountRecord = {
      id: this.ids.next('account'),
      ledgerId: input.ledgerId,
      name: `借入款 · ${lender} · ${payableId.slice(-6)}`,
      type: 'other_liability',
      normalBalance: 'credit',
      currency: 'CNY',
      institution: lender,
      createdAt: now,
      updatedAt: now,
    }
    await this.accounts.create(account)
    const transaction = await this.transactions.create(
      input.ledgerId,
      createBorrowing({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        payableAccount: account,
        depositAccount,
        counterparty: lender,
        note: input.note,
      }),
    )
    const record: PayableRecord = {
      id: payableId,
      ledgerId: input.ledgerId,
      accountId: account.id,
      borrowTransactionId: transaction.id,
      lender,
      originalAmountMinor: input.amountMinor,
      dueDate: optionalText(input.dueDate),
      note: optionalText(input.note),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    }
    await this.payables.create(record)
    return record
  }

  async repayPayable(input: RepayPayableInput): Promise<void> {
    assertPositiveMinorUnits(input.amountMinor, '归还金额')
    const payable = await this.payables.findById(input.payableId)
    if (!payable || payable.status === 'settled') throw new Error('借入款不存在或已结清')
    if (input.amountMinor > payable.outstandingMinor) throw new Error('归还金额不能超过待还金额')
    const [payableAccount, sourceAccount] = await Promise.all([
      this.accounts.findPostingRef(payable.accountId),
      this.accounts.findPostingRef(input.sourceAccountId),
    ])
    if (!payableAccount || !sourceAccount) throw new Error('还款账户不存在')
    await this.transactions.create(
      payable.ledgerId,
      createRepayBorrowing({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        payableAccount,
        sourceAccount,
        counterparty: payable.lender,
        note: input.note,
      }),
    )
    if (input.amountMinor === payable.outstandingMinor) {
      await this.payables.markSettled(payable.id, this.clock.nowIso())
    }
  }

  async updatePayable(input: UpdatePayableInput): Promise<void> {
    const payable = await this.payables.findById(input.payableId)
    if (!payable || payable.ledgerId !== input.ledgerId) {
      throw new Error('借入款不存在')
    }
    await this.payables.update(
      input.payableId,
      { dueDate: input.dueDate, note: input.note },
      this.clock.nowIso(),
    )
  }

  async deletePayable(ledgerId: string, payableId: string): Promise<void> {
    const payable = await this.payables.findById(payableId)
    if (!payable || payable.ledgerId !== ledgerId) {
      throw new Error('借入款不存在')
    }
    if (payable.status !== 'settled') {
      throw new Error('仅可删除已结清的借入款')
    }
    await this.payables.delete(payableId)
  }

  async createExpense(input: CreateExpenseInput): Promise<string> {
    const [account, category] = await Promise.all([
      this.accounts.findPostingRef(input.accountId),
      this.categories.findPostingRef(input.categoryId),
    ])
    if (!account) {
      throw new Error('付款账户不存在')
    }
    if (!category) {
      throw new Error('支出分类不存在')
    }

    const transaction = await this.transactions.create(
      input.ledgerId,
      createExpense({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        paymentAccount: account,
        category,
        merchant: input.merchant,
        note: input.note,
      }),
    )
    return transaction.id
  }

  async createIncome(input: CreateIncomeInput): Promise<string> {
    const [account, category] = await Promise.all([
      this.accounts.findPostingRef(input.accountId),
      this.categories.findPostingRef(input.categoryId),
    ])
    if (!account) {
      throw new Error('收款账户不存在')
    }
    if (!category) {
      throw new Error('收入分类不存在')
    }

    const transaction = await this.transactions.create(
      input.ledgerId,
      createIncome({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        depositAccount: account,
        category,
        merchant: input.merchant,
        note: input.note,
      }),
    )
    return transaction.id
  }

  async createTransfer(input: CreateTransferInput): Promise<string> {
    const [sourceAccount, targetAccount] = await Promise.all([
      this.accounts.findPostingRef(input.sourceAccountId),
      this.accounts.findPostingRef(input.targetAccountId),
    ])
    if (!sourceAccount) {
      throw new Error('转出账户不存在')
    }
    if (!targetAccount) {
      throw new Error('转入账户不存在')
    }

    const transaction = await this.transactions.create(
      input.ledgerId,
      createTransfer({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        sourceAccount,
        targetAccount,
        note: input.note,
      }),
    )
    return transaction.id
  }

  listRecentTransactions(ledgerId: string, limit: number): Promise<LedgerListItem[]> {
    return this.dashboard.listRecent(ledgerId, limit)
  }

  async voidTransaction(ledgerId: string, transactionId: string): Promise<void> {
    const transaction = await this.transactions.findById(transactionId)
    if (!transaction || transaction.ledgerId !== ledgerId) {
      throw new Error('交易不存在')
    }
    if (transaction.status === 'void') {
      throw new Error('交易已撤销')
    }
    if (transaction.type === 'opening_balance') {
      throw new Error('期初余额不能撤销，请通过余额调整修正')
    }
    await this.transactions.voidTransaction(transactionId, this.clock.nowIso())
  }

  async editTransaction(input: EditTransactionInput): Promise<void> {
    const transaction = await this.transactions.findById(input.transactionId)
    if (!transaction || transaction.ledgerId !== input.ledgerId) {
      throw new Error('交易不存在')
    }
    if (transaction.status === 'void') {
      throw new Error('已撤销的交易不能编辑')
    }
    await this.transactions.updateMetadata(
      input.transactionId,
      {
        occurredAt: input.occurredAt,
        merchant: input.merchant,
        note: input.note,
      },
      this.clock.nowIso(),
    )
  }

  async editTransactionFull(input: EditTransactionFullInput): Promise<string> {
    const oldTransaction = await this.transactions.findById(input.transactionId)
    if (!oldTransaction || oldTransaction.ledgerId !== input.ledgerId) {
      throw new Error('交易不存在')
    }
    if (oldTransaction.status === 'void') {
      throw new Error('已撤销的交易不能编辑')
    }
    await this.transactions.voidTransaction(input.transactionId, this.clock.nowIso())
    if (input.type === 'expense') {
      return this.createExpense({
        ledgerId: input.ledgerId,
        amountMinor: input.amountMinor,
        accountId: input.accountId,
        categoryId: input.categoryId,
        occurredAt: input.occurredAt,
        merchant: input.merchant,
        note: input.note,
      })
    }
    return this.createIncome({
      ledgerId: input.ledgerId,
      amountMinor: input.amountMinor,
      accountId: input.accountId,
      categoryId: input.categoryId,
      occurredAt: input.occurredAt,
      merchant: input.merchant,
      note: input.note,
    })
  }

  async getTransaction(transactionId: string): Promise<TransactionMetadata | undefined> {
    const transaction = await this.transactions.findById(transactionId)
    if (!transaction) return undefined

    const accountEntry = transaction.entries.find((e) => e.accountId)
    const categoryEntry = transaction.entries.find((e) => e.categoryId)

    let accountName: string | undefined
    let categoryName: string | undefined
    if (accountEntry?.accountId) {
      const account = await this.accounts.findBalance(accountEntry.accountId)
      accountName = account?.name
    }
    if (categoryEntry?.categoryId) {
      const categories = await this.categories.listByLedger(transaction.ledgerId)
      categoryName = categories.find((c) => c.id === categoryEntry.categoryId)?.name
    }

    return {
      id: transaction.id,
      ledgerId: transaction.ledgerId,
      type: transaction.type,
      status: transaction.status,
      amountMinor: transaction.amountMinor,
      occurredAt: transaction.occurredAt,
      createdAt: transaction.createdAt,
      merchant: transaction.merchant,
      note: transaction.note,
      categoryId: categoryEntry?.categoryId,
      categoryName,
      accountId: accountEntry?.accountId,
      accountName,
    }
  }

  private async ensureBalanceOffsetCategory(ledgerId: string): Promise<CategoryPostingRef> {
    const name = '账户余额调整'
    const existing = await this.categories.findByName(ledgerId, name)
    if (existing) return existing
    const now = this.clock.nowIso()
    const category: CategoryRecord = {
      id: this.ids.next('category'),
      ledgerId,
      kind: 'income',
      name,
      sortOrder: 9_999,
      createdAt: now,
      updatedAt: now,
    }
    await this.categories.create(category)
    return category
  }
}

export function useFinanceService(): FinanceServicePort | undefined {
  return inject(financeServiceKey, undefined)
}

function localMonthUtcRange(month: Date): { startUtc: string; endUtc: string } {
  return {
    startUtc: new Date(month.getFullYear(), month.getMonth(), 1).toISOString(),
    endUtc: new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString(),
  }
}

function requiredText(value: string, message: string): string {
  const text = value.trim()
  if (text === '') {
    throw new Error(message)
  }
  return text
}

function optionalText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

function assertNonNegativeMinorUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}格式不正确`)
}

function assertPositiveMinorUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}必须大于 0`)
}
