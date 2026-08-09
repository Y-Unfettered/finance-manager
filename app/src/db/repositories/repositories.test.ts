// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  createCreditPurchase,
  createExpense,
  createIncome,
  createTransfer,
} from '@/domain/accounting'
import type { AccountRecord } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { EntityKind, IdGenerator } from '@/domain/identity'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { runMigrations } from '../migration-runner'
import { AccountRepository } from './account-repository'
import { CategoryRepository } from './category-repository'
import { LedgerRepository } from './ledger-repository'
import { TransactionRepository } from './transaction-repository'

const clock: Clock = { nowIso: () => '2026-08-03T12:00:00.000Z' }

class SequenceIdGenerator implements IdGenerator {
  private readonly counts = new Map<EntityKind, number>()

  next(kind: EntityKind): string {
    const count = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, count)
    return `${kind}_${count}`
  }
}

describe('finance repositories', () => {
  it('initializes one ledger, one cash account and the base categories exactly once', async () => {
    const database = new NodeSqliteExecutor()
    await runMigrations(database, undefined, clock.nowIso)
    const ledgers = new LedgerRepository(database)
    const service = new LedgerInitializationService(ledgers, new SequenceIdGenerator(), clock)

    const first = await service.initialize()
    const second = await service.initialize()

    expect(first.created).toBe(true)
    expect(second).toEqual({ ledger: first.ledger, created: false })
    expect(await new AccountRepository(database).listByLedger(first.ledger.id)).toMatchObject([
      { name: '现金', type: 'cash', normalBalance: 'debit' },
    ])
    const categories = await new CategoryRepository(database).listByLedger(first.ledger.id)
    expect(categories).toHaveLength(13)
    expect(categories.filter((category) => category.kind === 'expense')).toHaveLength(8)
    expect(categories.filter((category) => category.kind === 'income')).toHaveLength(5)
  })

  it('persists four transaction types atomically and calculates the expected balances', async () => {
    const database = new NodeSqliteExecutor()
    await runMigrations(database, undefined, clock.nowIso)
    const ids = new SequenceIdGenerator()
    const initialization = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const ledgerId = initialization.ledger.id
    const accounts = new AccountRepository(database)
    const categories = new CategoryRepository(database)
    const transactions = new TransactionRepository(database, ids, clock)

    const bank = account('bank', ledgerId, '银行卡', 'bank', 'debit')
    const wechat = account('wechat', ledgerId, '微信余额', 'platform', 'debit')
    const credit = account('credit', ledgerId, '信用卡', 'credit_card', 'credit')
    await accounts.create(bank)
    await accounts.create(wechat)
    await accounts.create(credit)

    const categoryList = await categories.listByLedger(ledgerId)
    const food = categoryList.find((category) => category.name === '餐饮')
    const salary = categoryList.find((category) => category.name === '工资')
    expect(food).toBeDefined()
    expect(salary).toBeDefined()

    const income = await transactions.create(
      ledgerId,
      createIncome({
        amountMinor: 1_000_000,
        occurredAt: '2026-08-03T08:00:00+08:00',
        depositAccount: bank,
        category: salary!,
      }),
    )
    await transactions.create(
      ledgerId,
      createExpense({
        amountMinor: 3155,
        occurredAt: '2026-08-03T09:00:00+08:00',
        paymentAccount: bank,
        category: food!,
      }),
    )
    await transactions.create(
      ledgerId,
      createTransfer({
        amountMinor: 20_000,
        occurredAt: '2026-08-03T10:00:00+08:00',
        sourceAccount: bank,
        targetAccount: wechat,
      }),
    )
    await transactions.create(
      ledgerId,
      createCreditPurchase({
        amountMinor: 16_652,
        occurredAt: '2026-08-03T11:00:00+08:00',
        liabilityAccount: credit,
        category: food!,
      }),
    )

    expect(income.occurredAt).toBe('2026-08-03T00:00:00.000Z')
    expect((await transactions.findById(income.id))?.entries).toHaveLength(2)
    expect(await transactions.countByLedger(ledgerId)).toBe(4)
    expect((await transactions.listByLedger(ledgerId)).map((item) => item.type)).toEqual([
      'credit_purchase',
      'transfer',
      'expense',
      'income',
    ])

    const balances = await accounts.listBalances(ledgerId)
    expect(balanceMap(balances)).toMatchObject({
      bank: 976_845,
      wechat: 20_000,
      credit: 16_652,
    })
  })

  it('calculates account balances at a historical month end', async () => {
    const database = new NodeSqliteExecutor()
    await runMigrations(database, undefined, clock.nowIso)
    const ids = new SequenceIdGenerator()
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const accounts = new AccountRepository(database)
    const categories = new CategoryRepository(database)
    const transactions = new TransactionRepository(database, ids, clock)
    const bank = account('historical-bank', ledger.id, '历史银行卡', 'bank', 'debit')
    await accounts.create(bank)
    const categoryList = await categories.listByLedger(ledger.id)
    const salary = categoryList.find((category) => category.name === '工资')!
    const food = categoryList.find((category) => category.name === '餐饮')!

    await transactions.create(
      ledger.id,
      createIncome({
        amountMinor: 100_000,
        occurredAt: '2026-07-15T12:00:00+08:00',
        depositAccount: bank,
        category: salary,
      }),
    )
    await transactions.create(
      ledger.id,
      createExpense({
        amountMinor: 20_000,
        occurredAt: '2026-08-05T12:00:00+08:00',
        paymentAccount: bank,
        category: food,
      }),
    )

    expect(
      balanceMap(await accounts.listBalancesAt(ledger.id, '2026-08-01T00:00:00.000Z')),
    ).toMatchObject({ 'historical-bank': 100_000 })
    expect(
      balanceMap(await accounts.listBalancesAt(ledger.id, '2026-09-01T00:00:00.000Z')),
    ).toMatchObject({ 'historical-bank': 80_000 })
  })

  it('rolls back the transaction header when any entry fails', async () => {
    const database = new NodeSqliteExecutor()
    await runMigrations(database, undefined, clock.nowIso)
    const ids = new SequenceIdGenerator()
    const { ledger } = await new LedgerInitializationService(
      new LedgerRepository(database),
      ids,
      clock,
    ).initialize()
    const food = (await new CategoryRepository(database).listByLedger(ledger.id)).find(
      (category) => category.name === '餐饮',
    )!
    const transactions = new TransactionRepository(database, ids, clock)

    await expect(
      transactions.create(ledger.id, {
        type: 'expense',
        amountMinor: 100,
        currency: 'CNY',
        occurredAt: clock.nowIso(),
        entries: [
          {
            side: 'debit',
            amountMinor: 100,
            target: { kind: 'category', categoryId: food.id },
          },
          {
            side: 'credit',
            amountMinor: 100,
            target: { kind: 'account', accountId: 'missing-account' },
          },
        ],
      }),
    ).rejects.toThrow()
    expect(await transactions.countByLedger(ledger.id)).toBe(0)
  })

  it('keeps ledger, transaction and balances after closing and reopening the database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'finance-manager-'))
    const databasePath = join(directory, 'reopen.sqlite')
    const ids = new SequenceIdGenerator()

    try {
      const first = new NodeSqliteExecutor(new DatabaseSync(databasePath))
      await runMigrations(first, undefined, clock.nowIso)
      const { ledger } = await new LedgerInitializationService(
        new LedgerRepository(first),
        ids,
        clock,
      ).initialize()
      const accounts = new AccountRepository(first)
      const categories = new CategoryRepository(first)
      const bank = account('bank', ledger.id, '银行卡', 'bank', 'debit')
      await accounts.create(bank)
      const salary = (await categories.listByLedger(ledger.id)).find(
        (category) => category.name === '工资',
      )!
      await new TransactionRepository(first, ids, clock).create(
        ledger.id,
        createIncome({
          amountMinor: 888_800,
          occurredAt: clock.nowIso(),
          depositAccount: bank,
          category: salary,
        }),
      )
      first.close()

      const reopened = new NodeSqliteExecutor(new DatabaseSync(databasePath))
      await expect(runMigrations(reopened, undefined, clock.nowIso)).resolves.toEqual([])
      expect((await new LedgerRepository(reopened).findFirst())?.id).toBe(ledger.id)
      expect(
        balanceMap(await new AccountRepository(reopened).listBalances(ledger.id)),
      ).toMatchObject({ bank: 888_800 })
      expect(await new TransactionRepository(reopened, ids, clock).countByLedger(ledger.id)).toBe(1)
      reopened.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

function account(
  id: string,
  ledgerId: string,
  name: string,
  type: AccountRecord['type'],
  normalBalance: AccountRecord['normalBalance'],
): AccountRecord {
  return {
    id,
    ledgerId,
    name,
    type,
    normalBalance,
    currency: 'CNY',
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
  }
}

function balanceMap(
  records: readonly { id: string; balanceMinor: number }[],
): Record<string, number> {
  return Object.fromEntries(records.map((record) => [record.id, record.balanceMinor]))
}
