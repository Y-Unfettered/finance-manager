// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { AccountRepository } from '@/db/repositories/account-repository'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { FinanceService } from './finance-service'

const clock: Clock = { nowIso: () => '2026-08-03T04:00:00.000Z' }

class SequenceIdGenerator implements IdGenerator {
  private readonly counts = new Map<EntityKind, number>()

  next(kind: EntityKind): string {
    const count = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, count)
    return `${kind}_${count}`
  }
}

describe('FinanceService', () => {
  it('creates an expense and exposes it through account balances and the monthly home snapshot', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)
    const cash = (await service.listAccounts(ledger.id)).find((account) => account.type === 'cash')!
    const food = (await service.listExpenseCategories(ledger.id)).find(
      (category) => category.name === '餐饮',
    )!

    await service.createExpense({
      ledgerId: ledger.id,
      amountMinor: 3_800,
      accountId: cash.id,
      categoryId: food.id,
      occurredAt: new Date(2026, 7, 3, 12).toISOString(),
      merchant: '午餐',
    })

    const balances = await new AccountRepository(database).listBalances(ledger.id)
    expect(balances.find((account) => account.id === cash.id)?.balanceMinor).toBe(-3_800)

    const snapshot = await service.loadHome(ledger.id, new Date(2026, 7, 1))
    expect(snapshot.monthLabel).toBe('2026年8月')
    expect(snapshot.summary).toEqual({
      incomeMinor: 0,
      expenseMinor: 3_800,
      balanceMinor: -3_800,
    })
    expect(snapshot.transactions).toMatchObject([
      {
        type: 'expense',
        amountMinor: 3_800,
        title: '午餐',
        accountLabel: '现金',
      },
    ])
  })

  it('creates a reusable bank account with the correct normal balance', async () => {
    const database = new NodeSqliteExecutor()
    const ids = new SequenceIdGenerator()
    await runMigrations(database, undefined, clock.nowIso)
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const service = new FinanceService(database, ids, clock)

    const bank = await service.createAccount({
      ledgerId: ledger.id,
      type: 'bank',
      name: ' 招商银行 ',
      institution: ' 招商银行 ',
    })

    expect(bank).toMatchObject({
      name: '招商银行',
      institution: '招商银行',
      normalBalance: 'debit',
    })
    expect(await service.listAccounts(ledger.id)).toContainEqual(
      expect.objectContaining({ id: bank.id, balanceMinor: 0 }),
    )
  })
})
