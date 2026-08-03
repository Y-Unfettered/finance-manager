import { inject, type InjectionKey } from 'vue'

import { createExpense, type CategoryPostingRef } from '@/domain/accounting'
import { normalBalanceForAccountType, type AccountType } from '@/domain/accounts'
import type { AccountBalanceRecord, AccountRecord } from '@/domain/entities'
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

export interface ExpenseCategoryOption extends CategoryPostingRef {
  name: string
}

export interface FinanceServicePort {
  loadHome(ledgerId: string, month: Date): Promise<HomeSnapshot>
  listAccounts(ledgerId: string): Promise<AccountBalanceRecord[]>
  listExpenseCategories(ledgerId: string): Promise<ExpenseCategoryOption[]>
  createAccount(input: CreateAccountInput): Promise<AccountRecord>
  createExpense(input: CreateExpenseInput): Promise<string>
}

export const financeServiceKey: InjectionKey<FinanceServicePort> = Symbol('financeService')

export class FinanceService implements FinanceServicePort {
  private readonly accounts: AccountRepository
  private readonly categories: CategoryRepository
  private readonly dashboard: DashboardRepository
  private readonly transactions: TransactionRepository

  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.accounts = new AccountRepository(database)
    this.categories = new CategoryRepository(database)
    this.dashboard = new DashboardRepository(database)
    this.transactions = new TransactionRepository(database, ids, clock)
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

  async listExpenseCategories(ledgerId: string): Promise<ExpenseCategoryOption[]> {
    const categories = await this.categories.listByLedger(ledgerId)
    return categories
      .filter((category) => category.kind === 'expense' && !category.archivedAt)
      .map(({ id, kind, name }) => ({ id, kind, name }))
  }

  async createAccount(input: CreateAccountInput): Promise<AccountRecord> {
    const now = this.clock.nowIso()
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
    return record
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
