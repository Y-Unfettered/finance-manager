import { inject, type InjectionKey } from 'vue'

import type { BudgetRecord, BudgetWithProgress, CategoryBudgetProgress } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import { BudgetRepository, type CategoryBudgetInput } from '@/db/repositories/budget-repository'

export interface BudgetSummary {
  budget: BudgetRecord
  spentMinor: number
  remainingMinor: number
  overspent: boolean
  categoryProgress: readonly CategoryBudgetProgress[]
}

export interface CreateBudgetInput {
  ledgerId: string
  periodKey: string
  totalLimitMinor: number
  note?: string
  categoryBudgets: readonly CategoryBudgetInput[]
}

export interface UpdateBudgetInput {
  ledgerId: string
  budgetId: string
  totalLimitMinor?: number
  note?: string
  categoryBudgets?: readonly CategoryBudgetInput[]
}

export interface BudgetServicePort {
  createBudget(input: CreateBudgetInput): Promise<BudgetRecord>
  updateBudget(input: UpdateBudgetInput): Promise<void>
  deleteBudget(ledgerId: string, budgetId: string): Promise<void>
  getBudgetForPeriod(ledgerId: string, periodKey: string): Promise<BudgetWithProgress | undefined>
  listBudgets(ledgerId: string): Promise<readonly BudgetRecord[]>
  getBudgetDetail(budgetId: string): Promise<BudgetSummary | undefined>
}

export const budgetServiceKey: InjectionKey<BudgetServicePort> = Symbol('budgetService')

export class BudgetService implements BudgetServicePort {
  private readonly budgets: BudgetRepository

  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.budgets = new BudgetRepository(database)
    this.database = database
  }

  private readonly database: SqliteExecutor

  async createBudget(input: CreateBudgetInput): Promise<BudgetRecord> {
    assertPeriodKey(input.periodKey)
    assertNonNegativeMinorUnits(input.totalLimitMinor, '预算总额')
    for (const cb of input.categoryBudgets) {
      assertNonNegativeMinorUnits(cb.limitMinor, '分类预算')
    }
    const existing = await this.budgets.findByPeriod(input.ledgerId, 'monthly', input.periodKey)
    if (existing) {
      throw new Error(`${input.periodKey} 已存在预算，请使用编辑功能`)
    }
    const now = this.clock.nowIso()
    const record: BudgetRecord = {
      id: this.ids.next('budget'),
      ledgerId: input.ledgerId,
      periodType: 'monthly',
      periodKey: input.periodKey,
      totalLimitMinor: input.totalLimitMinor,
      note: optionalText(input.note),
      createdAt: now,
      updatedAt: now,
    }
    await this.budgets.create(record, input.categoryBudgets)
    return record
  }

  async updateBudget(input: UpdateBudgetInput): Promise<void> {
    const budget = await this.budgets.findById(input.budgetId)
    if (!budget || budget.ledgerId !== input.ledgerId) {
      throw new Error('预算不存在')
    }
    if (input.totalLimitMinor !== undefined) {
      assertNonNegativeMinorUnits(input.totalLimitMinor, '预算总额')
    }
    if (input.categoryBudgets) {
      for (const cb of input.categoryBudgets) {
        assertNonNegativeMinorUnits(cb.limitMinor, '分类预算')
      }
    }
    await this.budgets.update(
      input.budgetId,
      { totalLimitMinor: input.totalLimitMinor, note: input.note },
      input.categoryBudgets,
      this.clock.nowIso(),
    )
  }

  async deleteBudget(ledgerId: string, budgetId: string): Promise<void> {
    const budget = await this.budgets.findById(budgetId)
    if (!budget || budget.ledgerId !== ledgerId) {
      throw new Error('预算不存在')
    }
    await this.budgets.delete(budgetId)
  }

  async getBudgetForPeriod(
    ledgerId: string,
    periodKey: string,
  ): Promise<BudgetWithProgress | undefined> {
    const budget = await this.budgets.findByPeriod(ledgerId, 'monthly', periodKey)
    if (!budget) return undefined
    const [categoryBudgets, spentByCategory, totalSpent] = await Promise.all([
      this.budgets.listCategoryBudgets(budget.id),
      this.computeSpentByCategory(ledgerId, periodKey),
      this.computeTotalSpent(ledgerId, periodKey),
    ])
    const categoryProgress: CategoryBudgetProgress[] = categoryBudgets.map((cb) => {
      const spent = spentByCategory.get(cb.categoryId) ?? 0
      const remaining = cb.limitMinor - spent
      return {
        ...cb,
        spentMinor: spent,
        remainingMinor: remaining,
        overspent: cb.limitMinor > 0 && spent > cb.limitMinor,
      }
    })
    return {
      ...budget,
      spentMinor: totalSpent,
      remainingMinor: budget.totalLimitMinor - totalSpent,
      overspent: budget.totalLimitMinor > 0 && totalSpent > budget.totalLimitMinor,
      categoryBudgets: categoryProgress,
    }
  }

  async listBudgets(ledgerId: string): Promise<readonly BudgetRecord[]> {
    return this.budgets.listByLedger(ledgerId)
  }

  async getBudgetDetail(budgetId: string): Promise<BudgetSummary | undefined> {
    const budget = await this.budgets.findById(budgetId)
    if (!budget) return undefined
    const [categoryBudgets, spentByCategory, totalSpent] = await Promise.all([
      this.budgets.listCategoryBudgets(budget.id),
      this.computeSpentByCategory(budget.ledgerId, budget.periodKey),
      this.computeTotalSpent(budget.ledgerId, budget.periodKey),
    ])
    const categoryProgress: CategoryBudgetProgress[] = categoryBudgets.map((cb) => {
      const spent = spentByCategory.get(cb.categoryId) ?? 0
      const remaining = cb.limitMinor - spent
      return {
        ...cb,
        spentMinor: spent,
        remainingMinor: remaining,
        overspent: cb.limitMinor > 0 && spent > cb.limitMinor,
      }
    })
    return {
      budget,
      spentMinor: totalSpent,
      remainingMinor: budget.totalLimitMinor - totalSpent,
      overspent: budget.totalLimitMinor > 0 && totalSpent > budget.totalLimitMinor,
      categoryProgress,
    }
  }

  private async computeTotalSpent(ledgerId: string, periodKey: string): Promise<number> {
    const range = monthlyUtcRangeFromKey(periodKey)
    const rows = await this.database.query<{ spent: number }>(
      `
        SELECT COALESCE(SUM(transactions.amount_minor), 0) AS spent
        FROM transactions
        WHERE transactions.ledger_id = ?
          AND transactions.status = 'posted'
          AND transactions.type IN ('expense', 'credit_purchase')
          AND transactions.occurred_at >= ?
          AND transactions.occurred_at < ?
      `,
      [ledgerId, range.startUtc, range.endUtc],
    )
    return rows[0]?.spent ?? 0
  }

  private async computeSpentByCategory(
    ledgerId: string,
    periodKey: string,
  ): Promise<Map<string, number>> {
    const range = monthlyUtcRangeFromKey(periodKey)
    const rows = await this.database.query<{ categoryId: string; spent: number }>(
      `
        SELECT entries.category_id AS categoryId, COALESCE(SUM(transactions.amount_minor), 0) AS spent
        FROM transactions
        JOIN entries ON entries.transaction_id = transactions.id AND entries.category_id IS NOT NULL
        WHERE transactions.ledger_id = ?
          AND transactions.status = 'posted'
          AND transactions.type IN ('expense', 'credit_purchase')
          AND transactions.occurred_at >= ?
          AND transactions.occurred_at < ?
        GROUP BY entries.category_id
      `,
      [ledgerId, range.startUtc, range.endUtc],
    )
    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.categoryId, row.spent)
    }
    return map
  }
}

export function useBudgetService(): BudgetServicePort | undefined {
  return inject(budgetServiceKey, undefined)
}

export function currentMonthPeriodKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${year}-${month}`
}

export function monthlyUtcRangeFromKey(periodKey: string): { startUtc: string; endUtc: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey)
  if (!match) {
    throw new Error(`periodKey must be YYYY-MM, got: ${periodKey}`)
  }
  const year = Number.parseInt(match[1]!, 10)
  const month = Number.parseInt(match[2]!, 10) - 1
  if (month < 0 || month > 11) {
    throw new Error(`periodKey month out of range: ${periodKey}`)
  }
  return {
    startUtc: new Date(Date.UTC(year, month, 1)).toISOString(),
    endUtc: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  }
}

function assertPeriodKey(value: string): void {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('期间格式应为 YYYY-MM')
  }
}

function assertNonNegativeMinorUnits(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}格式不正确`)
}

function optionalText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}
