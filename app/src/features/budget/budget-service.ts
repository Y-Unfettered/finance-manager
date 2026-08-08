import { inject, type InjectionKey } from 'vue'

import type {
  BudgetMode,
  BudgetRecord,
  BudgetWithProgress,
  CategoryBudgetProgress,
} from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import { BudgetRepository, type CategoryBudgetInput } from '@/db/repositories/budget-repository'

export interface BudgetSummary {
  budget: BudgetRecord
  spentMinor: number
  remainingMinor: number
  overspent: boolean
  categoryBudgetTotalMinor: number
  unallocatedBudgetMinor: number
  unallocatedSpentMinor: number
  categoryProgress: readonly CategoryBudgetProgress[]
}

export interface CreateBudgetInput {
  ledgerId: string
  periodKey: string
  totalLimitMinor: number
  mode?: BudgetMode
  autoCopy?: boolean
  sourcePeriodKey?: string
  note?: string
  categoryBudgets: readonly CategoryBudgetInput[]
}

export interface UpdateBudgetInput {
  ledgerId: string
  budgetId: string
  totalLimitMinor?: number
  mode?: BudgetMode
  autoCopy?: boolean
  note?: string
  categoryBudgets?: readonly CategoryBudgetInput[]
  applyToFuture?: boolean
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
    const normalized = normalizeBudgetConfiguration(
      input.mode ?? inferBudgetMode(input.totalLimitMinor, input.categoryBudgets),
      input.totalLimitMinor,
      input.categoryBudgets,
    )
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
      totalLimitMinor: normalized.totalLimitMinor,
      mode: normalized.mode,
      autoCopy: input.autoCopy ?? true,
      sourcePeriodKey: input.sourcePeriodKey,
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
    const currentCategories =
      input.categoryBudgets ?? (await this.budgets.listCategoryBudgets(budget.id))
    const normalized = normalizeBudgetConfiguration(
      input.mode ?? budget.mode,
      input.totalLimitMinor ?? budget.totalLimitMinor,
      currentCategories,
    )
    await this.budgets.update(
      input.budgetId,
      {
        totalLimitMinor: normalized.totalLimitMinor,
        note: input.note,
        mode: normalized.mode,
        autoCopy: input.autoCopy,
      },
      input.categoryBudgets,
      this.clock.nowIso(),
    )
    if (input.applyToFuture) {
      const future = (await this.budgets.listByLedger(input.ledgerId)).filter(
        (item) => item.periodKey > budget.periodKey,
      )
      for (const target of future) {
        await this.budgets.update(
          target.id,
          {
            totalLimitMinor: normalized.totalLimitMinor,
            note: input.note,
            mode: normalized.mode,
            autoCopy: input.autoCopy,
          },
          currentCategories.map(({ categoryId, limitMinor }) => ({ categoryId, limitMinor })),
          this.clock.nowIso(),
        )
      }
    }
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
    let budget = await this.budgets.findByPeriod(ledgerId, 'monthly', periodKey)
    if (!budget) {
      budget = await this.copyLatestBudget(ledgerId, periodKey)
    }
    if (!budget) return undefined
    const [categoryBudgets, spentByCategory, countByCategory, allSpent] = await Promise.all([
      this.budgets.listCategoryBudgets(budget.id),
      this.computeSpentByCategory(ledgerId, periodKey),
      this.computeCountByCategory(ledgerId, periodKey),
      this.computeTotalSpent(ledgerId, periodKey),
    ])
    const categoryProgress: CategoryBudgetProgress[] = categoryBudgets.map((cb) => {
      const spent = spentByCategory.get(cb.categoryId) ?? 0
      const remaining = cb.limitMinor - spent
      return {
        ...cb,
        spentMinor: spent,
        transactionCount: countByCategory.get(cb.categoryId) ?? 0,
        remainingMinor: remaining,
        overspent: cb.limitMinor > 0 && spent > cb.limitMinor,
      }
    })
    const categoryBudgetTotalMinor = categoryBudgets.reduce((sum, item) => sum + item.limitMinor, 0)
    const selectedSpent = categoryProgress.reduce((sum, item) => sum + item.spentMinor, 0)
    const unallocatedBudgetMinor = Math.max(0, budget.totalLimitMinor - categoryBudgetTotalMinor)
    const unallocatedSpentMinor = Math.max(0, allSpent - selectedSpent)
    const countedSpent = countedBudgetSpend(
      budget.mode,
      budget.totalLimitMinor,
      categoryBudgetTotalMinor,
      selectedSpent,
      allSpent,
    )
    return {
      ...budget,
      spentMinor: countedSpent,
      remainingMinor: budget.totalLimitMinor - countedSpent,
      overspent: budget.totalLimitMinor > 0 && countedSpent > budget.totalLimitMinor,
      categoryBudgetTotalMinor,
      unallocatedBudgetMinor,
      unallocatedSpentMinor,
      categoryBudgets: categoryProgress,
    }
  }

  async listBudgets(ledgerId: string): Promise<readonly BudgetRecord[]> {
    return this.budgets.listByLedger(ledgerId)
  }

  async getBudgetDetail(budgetId: string): Promise<BudgetSummary | undefined> {
    const budget = await this.budgets.findById(budgetId)
    if (!budget) return undefined
    const [categoryBudgets, spentByCategory, countByCategory, allSpent] = await Promise.all([
      this.budgets.listCategoryBudgets(budget.id),
      this.computeSpentByCategory(budget.ledgerId, budget.periodKey),
      this.computeCountByCategory(budget.ledgerId, budget.periodKey),
      this.computeTotalSpent(budget.ledgerId, budget.periodKey),
    ])
    const categoryProgress: CategoryBudgetProgress[] = categoryBudgets.map((cb) => {
      const spent = spentByCategory.get(cb.categoryId) ?? 0
      const remaining = cb.limitMinor - spent
      return {
        ...cb,
        spentMinor: spent,
        transactionCount: countByCategory.get(cb.categoryId) ?? 0,
        remainingMinor: remaining,
        overspent: cb.limitMinor > 0 && spent > cb.limitMinor,
      }
    })
    const categoryBudgetTotalMinor = categoryBudgets.reduce((sum, item) => sum + item.limitMinor, 0)
    const selectedSpent = categoryProgress.reduce((sum, item) => sum + item.spentMinor, 0)
    const countedSpent = countedBudgetSpend(
      budget.mode,
      budget.totalLimitMinor,
      categoryBudgetTotalMinor,
      selectedSpent,
      allSpent,
    )
    return {
      budget,
      spentMinor: countedSpent,
      remainingMinor: budget.totalLimitMinor - countedSpent,
      overspent: budget.totalLimitMinor > 0 && countedSpent > budget.totalLimitMinor,
      categoryBudgetTotalMinor,
      unallocatedBudgetMinor: Math.max(0, budget.totalLimitMinor - categoryBudgetTotalMinor),
      unallocatedSpentMinor: Math.max(0, allSpent - selectedSpent),
      categoryProgress,
    }
  }

  private async copyLatestBudget(
    ledgerId: string,
    periodKey: string,
  ): Promise<BudgetRecord | undefined> {
    const source = await this.budgets.findLatestAutoCopyBefore(ledgerId, periodKey)
    if (!source) return undefined
    const categories = await this.budgets.listCategoryBudgets(source.id)
    const activeRows = await this.database.query<{ id: string }>(
      'SELECT id FROM categories WHERE ledger_id = ? AND archived_at IS NULL',
      [ledgerId],
    )
    const activeCategoryIds = new Set(activeRows.map((row) => row.id))
    const copiedCategories = categories.filter(({ categoryId }) =>
      activeCategoryIds.has(categoryId),
    )
    if (source.mode !== 'total_only' && copiedCategories.length === 0) return undefined
    return this.createBudget({
      ledgerId,
      periodKey,
      mode: source.mode,
      totalLimitMinor: source.totalLimitMinor,
      autoCopy: source.autoCopy,
      sourcePeriodKey: source.periodKey,
      note: source.note,
      categoryBudgets: copiedCategories.map(({ categoryId, limitMinor }) => ({
        categoryId,
        limitMinor,
      })),
    })
  }

  private async computeTotalSpent(ledgerId: string, periodKey: string): Promise<number> {
    const range = monthlyUtcRangeFromKey(periodKey)
    const rows = await this.database.query<{ spent: number }>(
      `
        SELECT
          COALESCE((
            SELECT SUM(amount_minor) FROM transactions
            WHERE ledger_id = ? AND status = 'posted'
              AND type IN ('expense', 'credit_purchase')
              AND occurred_at >= ? AND occurred_at < ?
          ), 0)
          - COALESCE((
            SELECT SUM(refunds.amount_minor)
            FROM transaction_links
            JOIN transactions AS refunds ON refunds.id = transaction_links.transaction_id
            JOIN transactions AS originals ON originals.id = transaction_links.original_transaction_id
            WHERE transaction_links.relation_type = 'refund'
              AND refunds.status = 'posted' AND originals.status = 'posted'
              AND originals.ledger_id = ?
              AND originals.occurred_at >= ? AND originals.occurred_at < ?
          ), 0)
          - COALESCE((
            SELECT SUM(refunds.amount_minor)
            FROM transactions AS refunds
            WHERE refunds.ledger_id = ? AND refunds.status = 'posted' AND refunds.type = 'refund'
              AND refunds.occurred_at >= ? AND refunds.occurred_at < ?
              AND NOT EXISTS (
                SELECT 1 FROM transaction_links
                WHERE transaction_links.transaction_id = refunds.id
                  AND transaction_links.relation_type = 'refund'
              )
          ), 0) AS spent
      `,
      [
        ledgerId,
        range.startUtc,
        range.endUtc,
        ledgerId,
        range.startUtc,
        range.endUtc,
        ledgerId,
        range.startUtc,
        range.endUtc,
      ],
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
        WITH category_activity AS (
          SELECT COALESCE(categories.parent_id, categories.id) AS categoryId,
            transactions.amount_minor AS amountMinor
          FROM transactions
          JOIN entries ON entries.transaction_id = transactions.id AND entries.category_id IS NOT NULL
          JOIN categories ON categories.id = entries.category_id
          WHERE transactions.ledger_id = ? AND transactions.status = 'posted'
            AND transactions.type IN ('expense', 'credit_purchase')
            AND transactions.occurred_at >= ? AND transactions.occurred_at < ?
          UNION ALL
          SELECT COALESCE(categories.parent_id, categories.id), -refunds.amount_minor
          FROM transaction_links
          JOIN transactions AS refunds ON refunds.id = transaction_links.transaction_id
          JOIN transactions AS originals ON originals.id = transaction_links.original_transaction_id
          JOIN entries ON entries.transaction_id = originals.id AND entries.category_id IS NOT NULL
          JOIN categories ON categories.id = entries.category_id
          WHERE transaction_links.relation_type = 'refund'
            AND refunds.status = 'posted' AND originals.status = 'posted'
            AND originals.ledger_id = ?
            AND originals.occurred_at >= ? AND originals.occurred_at < ?
          UNION ALL
          SELECT COALESCE(categories.parent_id, categories.id), -refunds.amount_minor
          FROM transactions AS refunds
          JOIN entries ON entries.transaction_id = refunds.id AND entries.category_id IS NOT NULL
          JOIN categories ON categories.id = entries.category_id
          WHERE refunds.ledger_id = ? AND refunds.status = 'posted' AND refunds.type = 'refund'
            AND refunds.occurred_at >= ? AND refunds.occurred_at < ?
            AND NOT EXISTS (
              SELECT 1 FROM transaction_links
              WHERE transaction_links.transaction_id = refunds.id
                AND transaction_links.relation_type = 'refund'
            )
        )
        SELECT categoryId, COALESCE(SUM(amountMinor), 0) AS spent
        FROM category_activity GROUP BY categoryId
      `,
      [
        ledgerId,
        range.startUtc,
        range.endUtc,
        ledgerId,
        range.startUtc,
        range.endUtc,
        ledgerId,
        range.startUtc,
        range.endUtc,
      ],
    )
    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.categoryId, row.spent)
    }
    return map
  }

  private async computeCountByCategory(
    ledgerId: string,
    periodKey: string,
  ): Promise<Map<string, number>> {
    const range = monthlyUtcRangeFromKey(periodKey)
    const rows = await this.database.query<{ categoryId: string; transactionCount: number }>(
      `
        SELECT COALESCE(categories.parent_id, categories.id) AS categoryId,
          COUNT(DISTINCT transactions.id) AS transactionCount
        FROM transactions
        JOIN entries ON entries.transaction_id = transactions.id AND entries.category_id IS NOT NULL
        JOIN categories ON categories.id = entries.category_id
        WHERE transactions.ledger_id = ?
          AND transactions.status = 'posted'
          AND transactions.type IN ('expense', 'credit_purchase')
          AND transactions.occurred_at >= ?
          AND transactions.occurred_at < ?
        GROUP BY COALESCE(categories.parent_id, categories.id)
      `,
      [ledgerId, range.startUtc, range.endUtc],
    )
    return new Map(rows.map((row) => [row.categoryId, row.transactionCount]))
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

function inferBudgetMode(
  totalLimitMinor: number,
  categoryBudgets: readonly CategoryBudgetInput[],
): BudgetMode {
  if (categoryBudgets.length === 0) return 'total_only'
  if (totalLimitMinor === 0) return 'categories_only'
  return 'total_and_categories'
}

function normalizeBudgetConfiguration(
  mode: BudgetMode,
  totalLimitMinor: number,
  categoryBudgets: readonly CategoryBudgetInput[],
): { mode: BudgetMode; totalLimitMinor: number } {
  const categoryTotal = categoryBudgets.reduce((sum, item) => sum + item.limitMinor, 0)
  if (mode === 'total_only') {
    if (categoryBudgets.length > 0) throw new Error('只设置总预算时不能同时保存分类预算')
    return { mode, totalLimitMinor }
  }
  if (categoryBudgets.length === 0) throw new Error('请至少设置一个一级分类预算')
  if (mode === 'categories_only') return { mode, totalLimitMinor: categoryTotal }
  if (totalLimitMinor < categoryTotal) {
    throw new Error(`总预算不能小于分类预算合计 ¥${(categoryTotal / 100).toFixed(2)}`)
  }
  return { mode, totalLimitMinor }
}

export function countedBudgetSpend(
  mode: BudgetMode,
  totalLimitMinor: number,
  categoryBudgetTotalMinor: number,
  selectedSpentMinor: number,
  allSpentMinor: number,
): number {
  if (mode === 'total_only') return allSpentMinor
  if (mode === 'categories_only') return selectedSpentMinor
  return totalLimitMinor === categoryBudgetTotalMinor ? selectedSpentMinor : allSpentMinor
}
