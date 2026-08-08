// @vitest-environment node
import { runMigrations } from '@/db/migration-runner'
import { AccountRepository } from '@/db/repositories/account-repository'
import { CategoryRepository } from '@/db/repositories/category-repository'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { LedgerInitializationService } from './ledger-initialization-service'
import { LedgerService } from './ledger-service'

const clock: Clock = { nowIso: () => '2026-08-08T08:00:00.000Z' }

class SequenceIds implements IdGenerator {
  private value = 0
  next(kind: EntityKind): string {
    this.value += 1
    return `${kind}_${this.value}`
  }
}

async function prepare() {
  const database = new NodeSqliteExecutor()
  const ids = new SequenceIds()
  await runMigrations(database, undefined, clock.nowIso)
  const initial = await new LedgerInitializationService(
    new LedgerRepository(database),
    ids,
    clock,
  ).initialize()
  return { database, ids, initial, service: new LedgerService(database, ids, clock) }
}

describe('LedgerService', () => {
  it('creates an isolated ledger with default account and categories', async () => {
    const { database, service } = await prepare()
    const created = await service.create('旅行账本')

    const accounts = await new AccountRepository(database).listBalances(created.id)
    const categories = await new CategoryRepository(database).listByLedger(created.id)
    expect(accounts.map((item) => item.name)).toEqual(['现金'])
    expect(categories.some((item) => item.name === '餐饮')).toBe(true)
    expect(categories.some((item) => item.name === '工资')).toBe(true)
    expect((await service.list()).map((item) => item.name)).toEqual(['日常账本', '旅行账本'])
  })

  it('renames, archives and restores a ledger without deleting its data', async () => {
    const { initial, service } = await prepare()
    const second = await service.create('备用账本')
    await service.rename(second.id, '家庭账本')
    await service.setArchived(initial.ledger.id, true)
    expect(
      (await service.list()).find((item) => item.id === initial.ledger.id)?.archivedAt,
    ).toBeTruthy()
    expect((await service.list()).find((item) => item.id === second.id)?.name).toBe('家庭账本')
    await service.setArchived(initial.ledger.id, false)
    expect(
      (await service.list()).find((item) => item.id === initial.ledger.id)?.archivedAt,
    ).toBeUndefined()
  })

  it('does not archive the last active ledger', async () => {
    const { initial, service } = await prepare()
    await expect(service.setArchived(initial.ledger.id, true)).rejects.toThrow('至少保留一个')
  })
})
