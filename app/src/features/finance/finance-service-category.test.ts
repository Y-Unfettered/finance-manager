// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { FinanceService } from './finance-service'

const clock: Clock = { nowIso: () => '2026-11-07T08:00:00.000Z' }

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
  const service = new FinanceService(database, ids, clock)
  return { database, ledger, service }
}

describe('FinanceService 分类重名规则', () => {
  it('与已归档分类同名的新建不再被阻断（2026-11-07 回测 bug）', async () => {
    const { ledger, service } = await prepare()
    const rootId = await service.saveCategory({
      ledgerId: ledger.id,
      kind: 'expense',
      name: '测试一级分类',
    })
    const childId = await service.saveCategory({
      ledgerId: ledger.id,
      kind: 'expense',
      parentId: rootId,
      name: '内衣鞋袜测试',
    })
    await service.archiveCategory(ledger.id, childId)

    // 修复前：归档分类参与查重，这里抛"同名分类已存在"
    const second = await service.saveCategory({
      ledgerId: ledger.id,
      kind: 'expense',
      parentId: rootId,
      name: '内衣鞋袜测试',
    })
    expect(second).toBeTruthy()
  })

  it('与未归档分类同名的新建仍被阻断', async () => {
    const { ledger, service } = await prepare()
    const rootId = await service.saveCategory({
      ledgerId: ledger.id,
      kind: 'expense',
      name: '测试一级分类',
    })
    await service.saveCategory({
      ledgerId: ledger.id,
      kind: 'expense',
      parentId: rootId,
      name: '数码测试',
    })
    await expect(
      service.saveCategory({ ledgerId: ledger.id, kind: 'expense', name: '数码测试' }),
    ).rejects.toThrow('同名分类已存在')
  })

  it('恢复已归档分类时若存在未归档同名分类则报错引导改名', async () => {
    const { ledger, service } = await prepare()
    const rootId = await service.saveCategory({
      ledgerId: ledger.id,
      kind: 'expense',
      name: '测试一级分类',
    })
    const archivedId = await service.saveCategory({
      ledgerId: ledger.id,
      kind: 'expense',
      parentId: rootId,
      name: '内衣鞋袜测试',
    })
    await service.archiveCategory(ledger.id, archivedId)
    await service.saveCategory({
      ledgerId: ledger.id,
      kind: 'expense',
      parentId: rootId,
      name: '内衣鞋袜测试',
    })
    await expect(service.unarchiveCategory(ledger.id, archivedId)).rejects.toThrow('同名')
  })
})
