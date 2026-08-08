// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { FinanceService } from '@/features/finance/finance-service'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { ExportService } from './export-service'

const clock: Clock = { nowIso: () => '2026-08-03T04:00:00.000Z' }

class SequenceIdGenerator implements IdGenerator {
  private readonly counts = new Map<EntityKind, number>()

  next(kind: EntityKind): string {
    const count = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, count)
    return `${kind}_${count}`
  }
}

async function setupLedgerWithTransactions() {
  const database = new NodeSqliteExecutor()
  const ids = new SequenceIdGenerator()
  await runMigrations(database, undefined, clock.nowIso)
  const { ledger } = await new LedgerInitializationService(
    new LedgerRepository(database),
    ids,
    clock,
  ).initialize()
  const finance = new FinanceService(database, ids, clock)
  const cash = (await finance.listAccounts(ledger.id)).find((a) => a.type === 'cash')!
  const food = (await finance.listExpenseCategories(ledger.id)).find((c) => c.name === '餐饮')!
  const salary = (await finance.listIncomeCategories(ledger.id)).find((c) => c.name === '工资')!
  await finance.createExpense({
    ledgerId: ledger.id,
    amountMinor: 3_800,
    accountId: cash.id,
    categoryId: food.id,
    occurredAt: '2026-08-01T03:00:00.000Z',
    merchant: '午餐,咖啡',
    note: '测试支出',
  })
  await finance.createIncome({
    ledgerId: ledger.id,
    amountMinor: 12_000,
    accountId: cash.id,
    categoryId: salary.id,
    occurredAt: '2026-08-02T03:00:00.000Z',
    merchant: '公司',
    note: '8月工资',
  })
  return { database, ids, ledger, finance, cash }
}

describe('ExportService', () => {
  it('exports transactions as CSV with header and escaped fields', async () => {
    const { database, ledger } = await setupLedgerWithTransactions()
    const service = new ExportService(database)
    const csv = await service.exportTransactionsCsv(ledger.id)

    const lines = csv.split('\n')
    expect(lines[0]).toBe('日期,类型,金额,账户,分类,商户,备注')
    // 收入在前（按 occurredAt DESC）
    expect(lines[1]).toContain('2026-08-02')
    expect(lines[1]).toContain('收入')
    expect(lines[1]).toContain('120.00')
    expect(lines[2]).toContain('2026-08-01')
    expect(lines[2]).toContain('支出')
    // 含逗号的商户应被引号包裹
    expect(lines[2]).toContain('"午餐,咖啡"')
  })

  it('exports transactions as JSON with structured fields', async () => {
    const { database, ledger } = await setupLedgerWithTransactions()
    const service = new ExportService(database)
    const json = await service.exportTransactionsJson(ledger.id)
    const parsed = JSON.parse(json)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].type).toBe('income')
    expect(parsed[0].amount).toBe('120.00')
    expect(parsed[0].account).toBe('现金')
    expect(parsed[1].type).toBe('expense')
    expect(parsed[1].amount).toBe('-38.00')
    expect(parsed[1].merchant).toBe('午餐,咖啡')
  })

  it('excludes void transactions by default and includes them when requested', async () => {
    const { database, ledger, finance, cash, ids } = await setupLedgerWithTransactions()
    const food = (await finance.listExpenseCategories(ledger.id)).find((c) => c.name === '餐饮')!
    const expenseId = await finance.createExpense({
      ledgerId: ledger.id,
      amountMinor: 500,
      accountId: cash.id,
      categoryId: food.id,
      occurredAt: '2026-08-03T03:00:00.000Z',
      merchant: '待撤销',
    })
    await finance.voidTransaction(ledger.id, expenseId)
    void ids

    const service = new ExportService(database)
    const csvDefault = await service.exportTransactionsCsv(ledger.id)
    const csvWithVoid = await service.exportTransactionsCsv(ledger.id, { includeVoid: true })

    const defaultLines = csvDefault.split('\n')
    const voidLines = csvWithVoid.split('\n')
    expect(defaultLines.filter((l) => l.includes('待撤销'))).toHaveLength(0)
    expect(voidLines.filter((l) => l.includes('待撤销'))).toHaveLength(1)
  })
})
