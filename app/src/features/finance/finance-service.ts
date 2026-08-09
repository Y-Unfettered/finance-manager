import { inject, type InjectionKey } from 'vue'

import {
  createBalanceAdjustment,
  createBorrowing,
  createCreditPurchase,
  createExpense,
  createIncome,
  createLoanOut,
  createLoanRecovery,
  createOpeningBalance,
  createRefund,
  createRepayment,
  createRepayBorrowing,
  createTransfer,
  type CategoryKind,
  type CategoryPostingRef,
  type TransactionDraft,
  type TransactionType,
} from '@/domain/accounting'
import {
  isLiabilityAccountType,
  normalBalanceForAccountType,
  type AccountType,
} from '@/domain/accounts'
import type {
  AccountBalanceRecord,
  AccountDetailRecord,
  AccountRecord,
  CategoryRecord,
  CategoryDetailRecord,
  PayableBalanceRecord,
  PayableRecord,
  ReceivableBalanceRecord,
  ReceivableRecord,
} from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import { AccountRepository } from '@/db/repositories/account-repository'
import { AccountProfileRepository } from '@/db/repositories/account-profile-repository'
import { CategoryRepository } from '@/db/repositories/category-repository'
import {
  DashboardRepository,
  type LedgerListItem,
  type MonthlySummary,
  type DailyFlowPoint,
} from '@/db/repositories/dashboard-repository'
import {
  TransactionRepository,
  type TransactionDiscountRecord,
} from '@/db/repositories/transaction-repository'
import type { AccountActivityRecord } from '@/db/repositories/transaction-repository'
import { PayableRepository } from '@/db/repositories/payable-repository'
import { ReceivableRepository } from '@/db/repositories/receivable-repository'

export type { LedgerListItem }

export interface HomeSnapshot {
  monthLabel: string
  summary: MonthlySummary
  transactions: readonly LedgerListItem[]
}

export interface RecentSummary {
  label: string
  incomeMinor: number
  expenseMinor: number
  points: readonly DailyFlowPoint[]
}

export interface CreateAccountInput {
  ledgerId: string
  name: string
  type: AccountType
  institution?: string
  initialBalanceMinor?: number
  occurredAt?: string
  brandKey?: string
  iconKey?: string
  color?: string
  includeInAssetStats?: boolean
  visibleInEntry?: boolean
  creditLimitMinor?: number
  billDay?: number
  repaymentDay?: number
  reminderDays?: number
}

export interface UpdateAccountInput extends Omit<
  CreateAccountInput,
  'ledgerId' | 'initialBalanceMinor' | 'occurredAt'
> {
  ledgerId: string
  accountId: string
}

export interface CreateExpenseInput {
  ledgerId: string
  amountMinor: number
  accountId: string
  categoryId: string
  occurredAt: string
  merchant?: string
  note?: string
  attachmentDataUris?: readonly string[]
  originalAmountMinor?: number
  discountMinor?: number
}

export interface CreateIncomeInput {
  ledgerId: string
  amountMinor: number
  accountId: string
  categoryId: string
  occurredAt: string
  merchant?: string
  note?: string
  attachmentDataUris?: readonly string[]
}

export interface CreateTransferInput {
  ledgerId: string
  amountMinor: number
  sourceAccountId: string
  targetAccountId: string
  occurredAt: string
  note?: string
  attachmentDataUris?: readonly string[]
}

export interface CreateCreditPurchaseInput {
  ledgerId: string
  amountMinor: number
  liabilityAccountId: string
  categoryId: string
  occurredAt: string
  merchant?: string
  note?: string
  attachmentDataUris?: readonly string[]
  originalAmountMinor?: number
  discountMinor?: number
}

export interface CreateRepaymentInput {
  ledgerId: string
  amountMinor: number
  sourceAccountId: string
  liabilityAccountId: string
  occurredAt: string
  merchant?: string
  note?: string
  attachmentDataUris?: readonly string[]
}

export interface CreateRefundInput {
  ledgerId: string
  amountMinor: number
  refundAccountId: string
  categoryId: string
  occurredAt: string
  merchant?: string
  note?: string
  originalTransactionId: string
  attachmentDataUris?: readonly string[]
}

export interface ExpenseCategoryOption extends CategoryPostingRef {
  name: string
  parentId?: string
  iconKey?: string
  color?: string
}

export interface IncomeCategoryOption extends CategoryPostingRef {
  name: string
  parentId?: string
  iconKey?: string
  color?: string
}

export interface SaveCategoryInput {
  ledgerId: string
  categoryId?: string
  kind: CategoryKind
  name: string
  parentId?: string
  iconKey?: string
  color?: string
  sortOrder?: number
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
  type: 'expense' | 'income' | 'transfer' | 'credit_purchase' | 'repayment' | 'refund'
  amountMinor: number
  accountId: string
  categoryId: string
  targetAccountId?: string
  occurredAt: string
  merchant?: string
  note?: string
  attachmentDataUris?: readonly string[]
  originalAmountMinor?: number
  discountMinor?: number
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
  originalTransactionId?: string
  attachmentDataUris: readonly string[]
  categoryId?: string
  categoryName?: string
  accountId?: string
  accountName?: string
  sourceAccountId?: string
  sourceAccountName?: string
  targetAccountId?: string
  targetAccountName?: string
  originalAmountMinor?: number
  discountMinor?: number
}

export interface FinanceServicePort {
  loadHome(ledgerId: string, month: Date): Promise<HomeSnapshot>
  loadRecentSummary(
    ledgerId: string,
    range: 'week' | '7d' | '15d',
    now?: Date,
  ): Promise<RecentSummary>
  listAccounts(ledgerId: string): Promise<AccountBalanceRecord[]>
  getAccount(accountId: string): Promise<AccountBalanceRecord | undefined>
  getAccountDetail(accountId: string): Promise<AccountDetailRecord | undefined>
  listAccountActivity(accountId: string): Promise<AccountActivityRecord[]>
  listExpenseCategories(ledgerId: string): Promise<ExpenseCategoryOption[]>
  listIncomeCategories(ledgerId: string): Promise<IncomeCategoryOption[]>
  listCategories(ledgerId: string): Promise<CategoryDetailRecord[]>
  saveCategory(input: SaveCategoryInput): Promise<string>
  archiveCategory(ledgerId: string, categoryId: string): Promise<void>
  unarchiveCategory(ledgerId: string, categoryId: string): Promise<void>
  createExpenseCategory(ledgerId: string, name: string): Promise<string>
  createIncomeCategory(ledgerId: string, name: string): Promise<string>
  createAccount(input: CreateAccountInput): Promise<AccountRecord>
  updateAccount(input: UpdateAccountInput): Promise<void>
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
  createCreditPurchase(input: CreateCreditPurchaseInput): Promise<string>
  createRepayment(input: CreateRepaymentInput): Promise<string>
  createRefund(input: CreateRefundInput): Promise<string>
  listRecentTransactions(ledgerId: string, limit: number): Promise<LedgerListItem[]>
  voidTransaction(ledgerId: string, transactionId: string): Promise<void>
  editTransaction(input: EditTransactionInput): Promise<void>
  editTransactionFull(input: EditTransactionFullInput): Promise<string>
  getTransaction(transactionId: string): Promise<TransactionMetadata | undefined>
}

export const financeServiceKey: InjectionKey<FinanceServicePort> = Symbol('financeService')

export class FinanceService implements FinanceServicePort {
  private readonly accounts: AccountRepository
  private readonly accountProfiles: AccountProfileRepository
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
    this.accountProfiles = new AccountProfileRepository(database)
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

  async loadRecentSummary(
    ledgerId: string,
    range: 'week' | '7d' | '15d',
    now: Date = new Date(),
  ): Promise<RecentSummary> {
    const dates = recentSummaryDateRange(range, now)
    const rows = await this.dashboard.getDailyFlow(ledgerId, dates.startUtc, dates.endUtc)
    const byDate = new Map(rows.map((row) => [row.date, row]))
    const points: DailyFlowPoint[] = []
    for (
      let cursor = new Date(dates.startLocal);
      cursor < dates.endLocal;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const key = localDateKey(cursor)
      points.push(byDate.get(key) ?? { date: key, incomeMinor: 0, expenseMinor: 0 })
    }
    return {
      label: range === 'week' ? '本周汇总' : `最近 ${range === '7d' ? 7 : 15} 日汇总`,
      incomeMinor: points.reduce((sum, point) => sum + point.incomeMinor, 0),
      expenseMinor: points.reduce((sum, point) => sum + point.expenseMinor, 0),
      points,
    }
  }

  listAccounts(ledgerId: string): Promise<AccountBalanceRecord[]> {
    return this.accounts.listBalances(ledgerId)
  }

  getAccount(accountId: string): Promise<AccountBalanceRecord | undefined> {
    return this.accounts.findBalance(accountId)
  }

  async getAccountDetail(accountId: string): Promise<AccountDetailRecord | undefined> {
    const account = await this.accounts.findBalance(accountId)
    if (!account) return undefined
    const [preference, creditProfile] = await Promise.all([
      this.accountProfiles.getPreference(accountId),
      this.accountProfiles.getCreditProfile(accountId),
    ])
    return {
      ...account,
      preference: preference ?? {
        accountId,
        includeInAssetStats: true,
        visibleInEntry: true,
        updatedAt: account.updatedAt,
      },
      creditProfile,
    }
  }

  listAccountActivity(accountId: string): Promise<AccountActivityRecord[]> {
    return this.transactions.listByAccount(accountId)
  }

  async listExpenseCategories(ledgerId: string): Promise<ExpenseCategoryOption[]> {
    const categories = await this.categories.listDetailsByLedger(ledgerId)
    return categories
      .filter((category) => category.kind === 'expense' && !category.archivedAt)
      .map(({ id, kind, name, parentId, iconKey, color }) => ({
        id,
        kind,
        name,
        parentId,
        iconKey,
        color,
      }))
  }

  async listIncomeCategories(ledgerId: string): Promise<IncomeCategoryOption[]> {
    const categories = await this.categories.listDetailsByLedger(ledgerId)
    return categories
      .filter((category) => category.kind === 'income' && !category.archivedAt)
      .map(({ id, kind, name, parentId, iconKey, color }) => ({
        id,
        kind,
        name,
        parentId,
        iconKey,
        color,
      }))
  }

  listCategories(ledgerId: string): Promise<CategoryDetailRecord[]> {
    return this.categories.listDetailsByLedger(ledgerId)
  }

  async saveCategory(input: SaveCategoryInput): Promise<string> {
    const name = requiredText(input.name, '请输入分类名称')
    const all = await this.categories.listDetailsByLedger(input.ledgerId)
    const parent = input.parentId
      ? all.find((category) => category.id === input.parentId)
      : undefined
    if (input.parentId && !parent) throw new Error('父分类不存在')
    if (parent?.kind !== undefined && parent.kind !== input.kind)
      throw new Error('父子分类收支类型必须一致')
    if (parent?.parentId) throw new Error('最多只支持两级分类')
    if (input.categoryId === input.parentId) throw new Error('分类不能作为自己的父分类')
    if (
      input.categoryId &&
      input.parentId &&
      all.some((item) => item.parentId === input.categoryId)
    ) {
      throw new Error('该一级分类仍有二级分类，请先迁移二级分类')
    }
    const duplicate = all.find(
      (category) =>
        category.id !== input.categoryId && category.kind === input.kind && category.name === name,
    )
    if (duplicate) throw new Error('同名分类已存在')
    const now = this.clock.nowIso()
    if (input.categoryId) {
      const existing = all.find((category) => category.id === input.categoryId)
      if (!existing) throw new Error('分类不存在')
      await this.categories.update(
        input.categoryId,
        {
          name,
          parentId: input.parentId,
          sortOrder: input.sortOrder ?? existing.sortOrder,
          iconKey: input.iconKey,
          color: input.color,
        },
        now,
      )
      return input.categoryId
    }
    const id = this.ids.next('category')
    await this.categories.create(
      {
        id,
        ledgerId: input.ledgerId,
        parentId: input.parentId,
        kind: input.kind,
        name,
        sortOrder: input.sortOrder ?? all.filter((item) => item.kind === input.kind).length,
        createdAt: now,
        updatedAt: now,
      },
      { iconKey: input.iconKey, color: input.color },
    )
    return id
  }

  async archiveCategory(ledgerId: string, categoryId: string): Promise<void> {
    const category = (await this.categories.listByLedger(ledgerId)).find(
      (item) => item.id === categoryId,
    )
    if (!category) throw new Error('分类不存在')
    await this.categories.archive(categoryId, this.clock.nowIso())
  }

  async unarchiveCategory(ledgerId: string, categoryId: string): Promise<void> {
    const category = (await this.categories.listByLedger(ledgerId)).find(
      (item) => item.id === categoryId,
    )
    if (!category) throw new Error('分类不存在')
    await this.categories.unarchive(categoryId, this.clock.nowIso())
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
    assertCreditFields(input)
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
    await this.accountProfiles.savePreference({
      accountId: record.id,
      brandKey: optionalText(input.brandKey),
      iconKey: optionalText(input.iconKey),
      color: optionalText(input.color),
      includeInAssetStats: input.includeInAssetStats ?? true,
      visibleInEntry: input.visibleInEntry ?? true,
      updatedAt: now,
    })
    if (isLiabilityAccountType(record.type)) {
      await this.accountProfiles.saveCreditProfile({
        accountId: record.id,
        creditLimitMinor: input.creditLimitMinor ?? 0,
        billDay: input.billDay,
        repaymentDay: input.repaymentDay,
        reminderDays: input.reminderDays ?? 3,
        effectiveFrom: input.occurredAt ?? now,
        createdAt: now,
        updatedAt: now,
      })
    }
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

  async updateAccount(input: UpdateAccountInput): Promise<void> {
    const account = await this.accounts.findBalance(input.accountId)
    if (!account || account.ledgerId !== input.ledgerId) throw new Error('账户不存在')
    assertCreditFields(input)
    if (input.type !== account.type && account.balanceMinor !== 0) {
      throw new Error('账户余额或欠款非零时不能修改账户类型')
    }
    const now = this.clock.nowIso()
    await this.accounts.updateDetails(
      input.accountId,
      {
        name: requiredText(input.name, '请输入账户名称'),
        type: input.type,
        institution: optionalText(input.institution),
      },
      now,
    )
    await this.accountProfiles.savePreference({
      accountId: input.accountId,
      brandKey: optionalText(input.brandKey),
      iconKey: optionalText(input.iconKey),
      color: optionalText(input.color),
      includeInAssetStats: input.includeInAssetStats ?? true,
      visibleInEntry: input.visibleInEntry ?? true,
      updatedAt: now,
    })
    if (isLiabilityAccountType(input.type)) {
      const existing = await this.accountProfiles.getCreditProfile(input.accountId)
      await this.accountProfiles.saveCreditProfile({
        accountId: input.accountId,
        creditLimitMinor: input.creditLimitMinor ?? 0,
        billDay: input.billDay,
        repaymentDay: input.repaymentDay,
        reminderDays: input.reminderDays ?? 3,
        effectiveFrom: existing?.effectiveFrom ?? now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
    } else {
      await this.accountProfiles.deleteCreditProfile(input.accountId)
    }
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
    const discount = validateDiscount(input)
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
      undefined,
      input.attachmentDataUris,
      discount,
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
      undefined,
      input.attachmentDataUris,
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
      undefined,
      input.attachmentDataUris,
    )
    return transaction.id
  }

  async createCreditPurchase(input: CreateCreditPurchaseInput): Promise<string> {
    const discount = validateDiscount(input)
    const [liabilityAccount, category] = await Promise.all([
      this.accounts.findPostingRef(input.liabilityAccountId),
      this.categories.findPostingRef(input.categoryId),
    ])
    if (!liabilityAccount) throw new Error('信用账户不存在')
    if (!category) throw new Error('支出分类不存在')

    const transaction = await this.transactions.create(
      input.ledgerId,
      createCreditPurchase({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        liabilityAccount,
        category,
        merchant: input.merchant,
        note: input.note,
      }),
      undefined,
      input.attachmentDataUris,
      discount,
    )
    return transaction.id
  }

  async createRepayment(input: CreateRepaymentInput): Promise<string> {
    const [sourceAccount, liabilityAccount] = await Promise.all([
      this.accounts.findPostingRef(input.sourceAccountId),
      this.accounts.findPostingRef(input.liabilityAccountId),
    ])
    if (!sourceAccount) throw new Error('还款账户不存在')
    if (!liabilityAccount) throw new Error('信用账户不存在')

    const transaction = await this.transactions.create(
      input.ledgerId,
      createRepayment({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        sourceAccount,
        liabilityAccount,
        merchant: input.merchant,
        note: input.note,
      }),
      undefined,
      input.attachmentDataUris,
    )
    return transaction.id
  }

  async createRefund(input: CreateRefundInput): Promise<string> {
    const [refundAccount, category] = await Promise.all([
      this.accounts.findPostingRef(input.refundAccountId),
      this.categories.findPostingRef(input.categoryId),
    ])
    if (!refundAccount) throw new Error('退款账户不存在')
    if (!category) throw new Error('原支出分类不存在')
    const original = await this.transactions.findById(input.originalTransactionId)
    if (
      !original ||
      original.ledgerId !== input.ledgerId ||
      !['expense', 'credit_purchase'].includes(original.type)
    ) {
      throw new Error('原支出不存在')
    }
    if (!original.entries.some((entry) => entry.categoryId === input.categoryId)) {
      throw new Error('退款分类必须与原支出一致')
    }
    const refunded = await this.transactions.refundedAmount(original.id)
    if (refunded + input.amountMinor > original.amountMinor) {
      throw new Error(
        `退款金额不能超过剩余可退金额 ¥${((original.amountMinor - refunded) / 100).toFixed(2)}`,
      )
    }

    const transaction = await this.transactions.create(
      input.ledgerId,
      createRefund({
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        refundAccount,
        category,
        merchant: input.merchant,
        note: input.note,
      }),
      { originalTransactionId: input.originalTransactionId, relationType: 'refund' },
      input.attachmentDataUris,
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
    if (
      ['expense', 'credit_purchase'].includes(transaction.type) &&
      (await this.transactions.refundedAmount(transaction.id)) > 0
    ) {
      throw new Error('该支出已有退款，请先删除关联退款')
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
    const discount = validateDiscount(input)
    const oldTransaction = await this.transactions.findById(input.transactionId)
    if (!oldTransaction || oldTransaction.ledgerId !== input.ledgerId) {
      throw new Error('交易不存在')
    }
    if (oldTransaction.status === 'void') {
      throw new Error('已撤销的交易不能编辑')
    }
    if (
      ['expense', 'credit_purchase'].includes(oldTransaction.type) &&
      (await this.transactions.refundedAmount(oldTransaction.id)) > 0
    ) {
      throw new Error('该支出已有退款，请先删除关联退款后再修改')
    }
    let draft: TransactionDraft
    let link: { originalTransactionId: string; relationType: 'refund' } | undefined
    switch (input.type) {
      case 'expense': {
        const [account, category] = await Promise.all([
          this.accounts.findPostingRef(input.accountId),
          this.categories.findPostingRef(input.categoryId),
        ])
        if (!account) throw new Error('付款账户不存在')
        if (!category) throw new Error('支出分类不存在')
        draft = createExpense({
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          paymentAccount: account,
          category,
          merchant: input.merchant,
          note: input.note,
        })
        break
      }
      case 'income': {
        const [account, category] = await Promise.all([
          this.accounts.findPostingRef(input.accountId),
          this.categories.findPostingRef(input.categoryId),
        ])
        if (!account) throw new Error('收款账户不存在')
        if (!category) throw new Error('收入分类不存在')
        draft = createIncome({
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          depositAccount: account,
          category,
          merchant: input.merchant,
          note: input.note,
        })
        break
      }
      case 'credit_purchase': {
        const [account, category] = await Promise.all([
          this.accounts.findPostingRef(input.accountId),
          this.categories.findPostingRef(input.categoryId),
        ])
        if (!account) throw new Error('信用账户不存在')
        if (!category) throw new Error('支出分类不存在')
        draft = createCreditPurchase({
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          liabilityAccount: account,
          category,
          merchant: input.merchant,
          note: input.note,
        })
        break
      }
      case 'refund': {
        const [account, category, originalTransactionId] = await Promise.all([
          this.accounts.findPostingRef(input.accountId),
          this.categories.findPostingRef(input.categoryId),
          this.transactions.originalTransactionId(input.transactionId),
        ])
        if (!account) throw new Error('退款账户不存在')
        if (!category) throw new Error('原支出分类不存在')
        if (originalTransactionId) {
          const original = await this.transactions.findById(originalTransactionId)
          if (!original) throw new Error('原支出不存在')
          const refunded = await this.transactions.refundedAmount(originalTransactionId)
          const otherRefunds = refunded - oldTransaction.amountMinor
          if (otherRefunds + input.amountMinor > original.amountMinor) {
            throw new Error(
              `退款金额不能超过剩余可退金额 ¥${((original.amountMinor - otherRefunds) / 100).toFixed(2)}`,
            )
          }
          link = { originalTransactionId, relationType: 'refund' }
        }
        draft = createRefund({
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          refundAccount: account,
          category,
          merchant: input.merchant,
          note: input.note,
        })
        break
      }
      case 'transfer': {
        const targetId = requiredText(input.targetAccountId ?? '', '请选择转入账户')
        const [sourceAccount, targetAccount] = await Promise.all([
          this.accounts.findPostingRef(input.accountId),
          this.accounts.findPostingRef(targetId),
        ])
        if (!sourceAccount) throw new Error('转出账户不存在')
        if (!targetAccount) throw new Error('转入账户不存在')
        draft = createTransfer({
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          sourceAccount,
          targetAccount,
          note: input.note,
        })
        break
      }
      case 'repayment': {
        const targetId = requiredText(input.targetAccountId ?? '', '请选择信用账户')
        const [sourceAccount, liabilityAccount] = await Promise.all([
          this.accounts.findPostingRef(input.accountId),
          this.accounts.findPostingRef(targetId),
        ])
        if (!sourceAccount) throw new Error('还款账户不存在')
        if (!liabilityAccount) throw new Error('信用账户不存在')
        draft = createRepayment({
          amountMinor: input.amountMinor,
          occurredAt: input.occurredAt,
          sourceAccount,
          liabilityAccount,
          merchant: input.merchant,
          note: input.note,
        })
        break
      }
    }
    const replacement = await this.transactions.replace(
      input.ledgerId,
      input.transactionId,
      draft,
      link,
      input.attachmentDataUris,
      discount,
    )
    return replacement.id
  }

  async getTransaction(transactionId: string): Promise<TransactionMetadata | undefined> {
    const transaction = await this.transactions.findById(transactionId)
    if (!transaction) return undefined
    const originalTransactionId =
      transaction.type === 'refund'
        ? await this.transactions.originalTransactionId(transaction.id)
        : undefined
    const attachmentDataUris = await this.transactions.listAttachmentDataUris(transaction.id)
    const discount = await this.transactions.findDiscount(transaction.id)

    const accountEntries = transaction.entries.filter((e) => e.accountId)
    const categoryEntry = transaction.entries.find((e) => e.categoryId)

    const accountIds = accountEntries
      .map((entry) => entry.accountId)
      .filter((id): id is string => Boolean(id))
    const accountRows = await Promise.all(accountIds.map((id) => this.accounts.findBalance(id)))
    const accountsById = new Map(
      accountRows
        .filter((account): account is AccountBalanceRecord => Boolean(account))
        .map((account) => [account.id, account]),
    )
    const isDualAccount = transaction.type === 'transfer' || transaction.type === 'repayment'
    const sourceEntry = isDualAccount
      ? accountEntries.find((entry) => entry.side === 'credit')
      : undefined
    const targetEntry = isDualAccount
      ? accountEntries.find((entry) => entry.side === 'debit')
      : undefined
    const accountEntry = sourceEntry ?? accountEntries[0]
    const accountName = accountEntry?.accountId
      ? accountsById.get(accountEntry.accountId)?.name
      : undefined
    let categoryName: string | undefined
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
      originalTransactionId,
      attachmentDataUris,
      categoryId: categoryEntry?.categoryId,
      categoryName,
      accountId: accountEntry?.accountId,
      accountName,
      sourceAccountId: sourceEntry?.accountId,
      sourceAccountName: sourceEntry?.accountId
        ? accountsById.get(sourceEntry.accountId)?.name
        : undefined,
      targetAccountId: targetEntry?.accountId,
      targetAccountName: targetEntry?.accountId
        ? accountsById.get(targetEntry.accountId)?.name
        : undefined,
      originalAmountMinor: discount?.originalAmountMinor,
      discountMinor: discount?.discountMinor,
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

function validateDiscount(input: {
  amountMinor: number
  originalAmountMinor?: number
  discountMinor?: number
}): TransactionDiscountRecord | undefined {
  const { originalAmountMinor, discountMinor } = input
  if (originalAmountMinor === undefined && discountMinor === undefined) return undefined
  if (originalAmountMinor === undefined || discountMinor === undefined) {
    throw new Error('优惠信息不完整')
  }
  if (!Number.isSafeInteger(originalAmountMinor) || originalAmountMinor <= 0) {
    throw new Error('原金额必须大于 0')
  }
  if (!Number.isSafeInteger(discountMinor) || discountMinor <= 0) {
    throw new Error('优惠金额必须大于 0')
  }
  if (discountMinor >= originalAmountMinor) {
    throw new Error('优惠金额必须小于原金额')
  }
  if (originalAmountMinor - discountMinor !== input.amountMinor) {
    throw new Error('优惠金额与实际支出不一致')
  }
  return { originalAmountMinor, discountMinor }
}

export function recentSummaryDateRange(
  range: 'week' | '7d' | '15d',
  now: Date,
): { startUtc: string; endUtc: string; startLocal: Date; endLocal: Date } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startLocal = new Date(today)
  if (range === 'week' || range === '7d') {
    const mondayOffset = (today.getDay() + 6) % 7
    startLocal.setDate(today.getDate() - mondayOffset)
  } else {
    startLocal.setDate(today.getDate() - 14)
  }
  const endLocal = new Date(startLocal)
  endLocal.setDate(startLocal.getDate() + (range === '15d' ? 15 : 7))
  return {
    startUtc: startLocal.toISOString(),
    endUtc: endLocal.toISOString(),
    startLocal,
    endLocal,
  }
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function assertCreditFields(input: {
  type: AccountType
  creditLimitMinor?: number
  billDay?: number
  repaymentDay?: number
  reminderDays?: number
}): void {
  if (!isLiabilityAccountType(input.type)) return
  assertNonNegativeMinorUnits(input.creditLimitMinor ?? 0, '总额度')
  for (const [label, value] of [
    ['出账日', input.billDay],
    ['还款日', input.repaymentDay],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 31)) {
      throw new Error(`${label}必须是 1 至 31`)
    }
  }
  if (
    input.reminderDays !== undefined &&
    (!Number.isInteger(input.reminderDays) || input.reminderDays < 0)
  ) {
    throw new Error('提醒提前天数格式不正确')
  }
}

function assertNonNegativeMinorUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}格式不正确`)
}

function assertPositiveMinorUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}必须大于 0`)
}
