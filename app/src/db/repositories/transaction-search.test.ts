// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { AccountRepository } from '@/db/repositories/account-repository'
import { CategoryRepository } from '@/db/repositories/category-repository'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import {
  TransactionRepository,
  type TransactionSearchFilter,
} from '@/db/repositories/transaction-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

const clock: Clock = { nowIso: () => '2026-08-03T12:00:00.000Z' }

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
  const accounts = await new AccountRepository(database).listBalances(ledger.id)
  const cats = await new CategoryRepository(database).listByLedger(ledger.id)
  const transactions = new TransactionRepository(database, ids, clock)

  // 插入测试数据：3笔支出+1笔收入+1笔转账
  await database.execute(
    `INSERT INTO transactions (id, ledger_id, type, status, amount_minor, currency, occurred_at, created_at, updated_at, merchant, note)
     VALUES
      ('tx-1', '${ledger.id}', 'expense', 'posted', 5000, 'CNY', '2026-08-01T10:00:00.000Z', '${clock.nowIso()}', '${clock.nowIso()}', '便利店', '早餐'),
      ('tx-2', '${ledger.id}', 'expense', 'posted', 20000, 'CNY', '2026-08-02T11:00:00.000Z', '${clock.nowIso()}', '${clock.nowIso()}', '星巴克', '咖啡'),
      ('tx-3', '${ledger.id}', 'expense', 'posted', 8000, 'CNY', '2026-08-03T09:00:00.000Z', '${clock.nowIso()}', '${clock.nowIso()}', '美团', '午餐'),
      ('tx-4', '${ledger.id}', 'income', 'posted', 80000, 'CNY', '2026-08-01T08:00:00.000Z', '${clock.nowIso()}', '${clock.nowIso()}', '公司', '工资'),
      ('tx-5', '${ledger.id}', 'transfer', 'posted', 10000, 'CNY', '2026-08-02T15:00:00.000Z', '${clock.nowIso()}', '${clock.nowIso()}', NULL, NULL),
      ('tx-void', '${ledger.id}', 'expense', 'void', 999, 'CNY', '2026-08-03T20:00:00.000Z', '${clock.nowIso()}', '${clock.nowIso()}', '撤销的', NULL);`,
  )

  const cash = accounts.find((a) => a.type === 'cash')!
  const food = cats.find((c) => c.name === '餐饮')!
  const income = cats.find((c) => c.kind === 'income')!
  await database.execute(
    `INSERT INTO entries (id, ledger_id, transaction_id, account_id, category_id, side, amount_minor, created_at) VALUES
      ('e-1a', '${ledger.id}', 'tx-1', '${cash.id}', NULL, 'credit', 5000, '${clock.nowIso()}'),
      ('e-1b', '${ledger.id}', 'tx-1', NULL, '${food.id}', 'debit', 5000, '${clock.nowIso()}'),
      ('e-2a', '${ledger.id}', 'tx-2', '${cash.id}', NULL, 'credit', 20000, '${clock.nowIso()}'),
      ('e-2b', '${ledger.id}', 'tx-2', NULL, '${food.id}', 'debit', 20000, '${clock.nowIso()}'),
      ('e-3a', '${ledger.id}', 'tx-3', '${cash.id}', NULL, 'credit', 8000, '${clock.nowIso()}'),
      ('e-3b', '${ledger.id}', 'tx-3', NULL, '${food.id}', 'debit', 8000, '${clock.nowIso()}'),
      ('e-4a', '${ledger.id}', 'tx-4', '${cash.id}', NULL, 'debit', 80000, '${clock.nowIso()}'),
      ('e-4b', '${ledger.id}', 'tx-4', NULL, '${income.id}', 'credit', 80000, '${clock.nowIso()}'),
      ('e-5a', '${ledger.id}', 'tx-5', '${cash.id}', NULL, 'debit', 10000, '${clock.nowIso()}'),
      ('e-5b', '${ledger.id}', 'tx-5', '${cash.id}', NULL, 'credit', 10000, '${clock.nowIso()}');`,
  )

  return { database, ledger, transactions, cash, food, income }
}

describe('TransactionRepository.search', () => {
  it('returns all posted transactions when no filter is applied', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id })
    expect(results.map((r) => r.id).sort()).toEqual(['tx-1', 'tx-2', 'tx-3', 'tx-4', 'tx-5'])
  })

  it('excludes voided transactions by default', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id })
    expect(results.find((r) => r.id === 'tx-void')).toBeUndefined()
  })

  it('includes voided when includeVoid is set', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id, includeVoid: true })
    expect(results.find((r) => r.id === 'tx-void')).toBeDefined()
  })

  it('filters by keyword matching merchant', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id, keyword: '星巴克' })
    expect(results.map((r) => r.id)).toEqual(['tx-2'])
  })

  it('filters by keyword matching note', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id, keyword: '工资' })
    expect(results.map((r) => r.id)).toEqual(['tx-4'])
  })

  it('filters by date range', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({
      ledgerId: ledger.id,
      startUtc: '2026-08-02T00:00:00.000Z',
      endUtc: '2026-08-03T00:00:00.000Z',
    })
    expect(results.map((r) => r.id).sort()).toEqual(['tx-2', 'tx-5'])
  })

  it('filters by account', async () => {
    const { ledger, transactions, cash } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id, accountId: cash.id })
    expect(results.map((r) => r.id).sort()).toEqual(['tx-1', 'tx-2', 'tx-3', 'tx-4', 'tx-5'])
  })

  it('filters by category', async () => {
    const { ledger, transactions, food } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id, categoryId: food.id })
    expect(results.map((r) => r.id).sort()).toEqual(['tx-1', 'tx-2', 'tx-3'])
  })

  it('filters by type', async () => {
    const { ledger, transactions } = await prepare()
    const income = await transactions.search({ ledgerId: ledger.id, type: 'income' })
    expect(income.map((r) => r.id)).toEqual(['tx-4'])
    const transfer = await transactions.search({ ledgerId: ledger.id, type: 'transfer' })
    expect(transfer.map((r) => r.id)).toEqual(['tx-5'])
  })

  it('filters by amount range', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({
      ledgerId: ledger.id,
      minAmountMinor: 5000,
      maxAmountMinor: 10000,
    })
    expect(results.map((r) => r.id).sort()).toEqual(['tx-1', 'tx-3', 'tx-5'])
  })

  it('combines multiple filters', async () => {
    const { ledger, transactions, food } = await prepare()
    const results = await transactions.search({
      ledgerId: ledger.id,
      keyword: '便利店',
      categoryId: food.id,
    })
    expect(results.map((r) => r.id)).toEqual(['tx-1'])
  })

  it('applies a limit', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id, limit: 2 })
    expect(results).toHaveLength(2)
  })

  it('returns empty array when nothing matches', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id, keyword: '不存在的关键词' })
    expect(results).toEqual([])
  })

  it('preserves category and account names in results', async () => {
    const { ledger, transactions } = await prepare()
    const results = await transactions.search({ ledgerId: ledger.id, keyword: '便利店' })
    expect(results[0]!.categoryName).toBe('餐饮')
    expect(results[0]!.primaryAccountName).toBe('现金')
    expect(results[0]!.merchant).toBe('便利店')
    expect(results[0]!.note).toBe('早餐')
  })

  it('handles unknown ledger gracefully', async () => {
    const { transactions } = await prepare()
    const results = await transactions.search({ ledgerId: 'unknown-ledger' })
    expect(results).toEqual([])
  })

  it('applies input as TransactionSearchFilter type', async () => {
    const filter: TransactionSearchFilter = {
      ledgerId: 'whatever',
      type: 'expense',
      minAmountMinor: 100,
    }
    expect(filter.type).toBe('expense')
    expect(filter.minAmountMinor).toBe(100)
  })
})
