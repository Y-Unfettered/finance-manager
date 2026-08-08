// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { CategoryRepository } from '@/db/repositories/category-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { BudgetService, currentMonthPeriodKey } from './budget-service'

const clock: Clock = { nowIso: () => '2026-08-03T04:00:00.000Z' }

class SequenceIdGenerator implements IdGenerator {
  private readonly counts = new Map<EntityKind, number>()

  next(kind: EntityKind): string {
    const count = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, count)
    return `${kind}_${count}`
  }
}

async function prepare() {
  const database = new NodeSqliteExecutor()
  const ids = new SequenceIdGenerator()
  await runMigrations(database, undefined, clock.nowIso)
  const { ledger } = await new LedgerInitializationService(
    new LedgerRepository(database),
    ids,
    clock,
  ).initialize()
  const service = new BudgetService(database, ids, clock)
  return { database, ids, ledger, service }
}

describe('BudgetService', () => {
  it('creates a monthly budget with category limits and retrieves progress', async () => {
    const { ledger, service, database } = await prepare()
    const cats = await new CategoryRepository(database).listByLedger(ledger.id)
    const food = cats.find((c) => c.name === '餐饮')!
    const transport = cats.find((c) => c.name === '交通')!

    const budget = await service.createBudget({
      ledgerId: ledger.id,
      periodKey: '2026-08',
      totalLimitMinor: 100_000,
      note: '8月预算',
      categoryBudgets: [
        { categoryId: food.id, limitMinor: 50_000 },
        { categoryId: transport.id, limitMinor: 20_000 },
      ],
    })

    expect(budget.periodKey).toBe('2026-08')
    expect(budget.totalLimitMinor).toBe(100_000)

    const detail = (await service.getBudgetDetail(budget.id))!
    expect(detail.budget.id).toBe(budget.id)
    expect(detail.spentMinor).toBe(0)
    expect(detail.remainingMinor).toBe(100_000)
    expect(detail.overspent).toBe(false)
    expect(detail.categoryProgress.map((c) => c.categoryName)).toEqual(['交通', '餐饮'])
  })

  it('computes spent amount from posted expense transactions in period', async () => {
    const { ledger, service, database } = await prepare()
    const cats = await new CategoryRepository(database).listByLedger(ledger.id)
    const food = cats.find((c) => c.name === '餐饮')!
    const accounts = await new (
      await import('@/db/repositories/account-repository')
    ).AccountRepository(database).listBalances(ledger.id)
    const cash = accounts.find((a) => a.type === 'cash')!

    await service.createBudget({
      ledgerId: ledger.id,
      periodKey: '2026-08',
      totalLimitMinor: 50_000,
      categoryBudgets: [{ categoryId: food.id, limitMinor: 20_000 }],
    })

    // 直接写入一笔支出交易（一笔账户侧分录 + 一笔分类侧分录）
    await database.execute(
      `INSERT INTO transactions (id, ledger_id, type, status, amount_minor, currency, occurred_at, created_at, updated_at)
       VALUES ('tx-1', '${ledger.id}', 'expense', 'posted', 15000, 'CNY', '2026-08-15T08:00:00.000Z', '${clock.nowIso()}', '${clock.nowIso()}');
       INSERT INTO entries (id, ledger_id, transaction_id, account_id, category_id, side, amount_minor, created_at)
       VALUES ('e-1', '${ledger.id}', 'tx-1', '${cash.id}', NULL, 'credit', 15000, '${clock.nowIso()}');
       INSERT INTO entries (id, ledger_id, transaction_id, account_id, category_id, side, amount_minor, created_at)
       VALUES ('e-2', '${ledger.id}', 'tx-1', NULL, '${food.id}', 'debit', 15000, '${clock.nowIso()}');`,
    )

    const progress = (await service.getBudgetForPeriod(ledger.id, '2026-08'))!
    expect(progress.spentMinor).toBe(15_000)
    expect(progress.remainingMinor).toBe(35_000)
    expect(progress.categoryBudgets[0]!.spentMinor).toBe(15_000)
    expect(progress.categoryBudgets[0]!.remainingMinor).toBe(5_000)
    expect(progress.categoryBudgets[0]!.overspent).toBe(false)
  })

  it('flags overspending when spent exceeds limit', async () => {
    const { ledger, service, database } = await prepare()
    const cats = await new CategoryRepository(database).listByLedger(ledger.id)
    const food = cats.find((c) => c.name === '餐饮')!
    const accounts = await new (
      await import('@/db/repositories/account-repository')
    ).AccountRepository(database).listBalances(ledger.id)
    const cash = accounts.find((a) => a.type === 'cash')!

    await service.createBudget({
      ledgerId: ledger.id,
      periodKey: '2026-08',
      totalLimitMinor: 10_000,
      categoryBudgets: [{ categoryId: food.id, limitMinor: 5_000 }],
    })

    await database.execute(
      `INSERT INTO transactions (id, ledger_id, type, status, amount_minor, currency, occurred_at, created_at, updated_at)
       VALUES ('tx-over', '${ledger.id}', 'expense', 'posted', 8000, 'CNY', '2026-08-10T08:00:00.000Z', '${clock.nowIso()}', '${clock.nowIso()}');
       INSERT INTO entries (id, ledger_id, transaction_id, account_id, category_id, side, amount_minor, created_at)
       VALUES ('e-over-1', '${ledger.id}', 'tx-over', '${cash.id}', NULL, 'credit', 8000, '${clock.nowIso()}');
       INSERT INTO entries (id, ledger_id, transaction_id, account_id, category_id, side, amount_minor, created_at)
       VALUES ('e-over-2', '${ledger.id}', 'tx-over', NULL, '${food.id}', 'debit', 8000, '${clock.nowIso()}');`,
    )

    const progress = (await service.getBudgetForPeriod(ledger.id, '2026-08'))!
    expect(progress.spentMinor).toBe(8_000)
    expect(progress.overspent).toBe(false) // 总额 10000 未超
    expect(progress.categoryBudgets[0]!.overspent).toBe(true) // 分类超了
  })

  it('rejects creating two budgets for the same period', async () => {
    const { ledger, service } = await prepare()
    await service.createBudget({
      ledgerId: ledger.id,
      periodKey: '2026-08',
      totalLimitMinor: 50_000,
      categoryBudgets: [],
    })
    await expect(
      service.createBudget({
        ledgerId: ledger.id,
        periodKey: '2026-08',
        totalLimitMinor: 30_000,
        categoryBudgets: [],
      }),
    ).rejects.toThrow('已存在预算')
  })

  it('updates budget total limit and category limits', async () => {
    const { ledger, service, database } = await prepare()
    const cats = await new CategoryRepository(database).listByLedger(ledger.id)
    const food = cats.find((c) => c.name === '餐饮')!
    const transport = cats.find((c) => c.name === '交通')!

    const budget = await service.createBudget({
      ledgerId: ledger.id,
      periodKey: '2026-08',
      totalLimitMinor: 50_000,
      categoryBudgets: [{ categoryId: food.id, limitMinor: 20_000 }],
    })

    await service.updateBudget({
      ledgerId: ledger.id,
      budgetId: budget.id,
      totalLimitMinor: 80_000,
      categoryBudgets: [
        { categoryId: food.id, limitMinor: 30_000 },
        { categoryId: transport.id, limitMinor: 20_000 },
      ],
    })

    const detail = (await service.getBudgetDetail(budget.id))!
    expect(detail.budget.totalLimitMinor).toBe(80_000)
    expect(detail.categoryProgress).toHaveLength(2)
    expect(detail.categoryProgress.map((c) => c.categoryName).sort()).toEqual(['交通', '餐饮'])
  })

  it('deletes a budget along with its category limits', async () => {
    const { ledger, service, database } = await prepare()
    const cats = await new CategoryRepository(database).listByLedger(ledger.id)
    const food = cats.find((c) => c.name === '餐饮')!

    const budget = await service.createBudget({
      ledgerId: ledger.id,
      periodKey: '2026-08',
      totalLimitMinor: 50_000,
      categoryBudgets: [{ categoryId: food.id, limitMinor: 20_000 }],
    })

    await service.deleteBudget(ledger.id, budget.id)
    const detail = await service.getBudgetDetail(budget.id)
    expect(detail).toBeUndefined()
    const remaining = await service.listBudgets(ledger.id)
    expect(remaining).toEqual([])
  })

  it('currentMonthPeriodKey produces YYYY-MM in local time', () => {
    expect(currentMonthPeriodKey(new Date(2026, 7, 3, 12))).toBe('2026-08')
    expect(currentMonthPeriodKey(new Date(2026, 0, 1))).toBe('2026-01')
    expect(currentMonthPeriodKey(new Date(2026, 11, 31, 23))).toBe('2026-12')
  })
})
