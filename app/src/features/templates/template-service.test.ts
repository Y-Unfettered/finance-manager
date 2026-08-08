// @vitest-environment node
import type { TransactionTemplateType } from '@/domain/entities'
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { TemplateService } from './template-service'

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
  const service = new TemplateService(database, ids, clock)
  return { database, ids, ledger, service }
}

describe('TemplateService', () => {
  it('creates a template with category and account references', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createTemplate({
      ledgerId: ledger.id,
      name: '便利店早餐',
      transactionType: 'expense',
      amountMinor: 1500,
      merchant: '便利店',
      note: '工作日早餐',
    })
    const templates = await service.listTemplates(ledger.id)
    expect(templates).toHaveLength(1)
    expect(templates[0]).toMatchObject({
      id,
      name: '便利店早餐',
      transactionType: 'expense',
      amountMinor: 1500,
      merchant: '便利店',
      note: '工作日早餐',
      sortOrder: 0,
    })
  })

  it('retrieves a single template by id with refs', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createTemplate({
      ledgerId: ledger.id,
      name: '工资',
      transactionType: 'income',
      amountMinor: 80000,
    })
    const tpl = await service.getTemplate(id)
    expect(tpl?.id).toBe(id)
    expect(tpl?.name).toBe('工资')
  })

  it('rejects creating a template with empty name', async () => {
    const { ledger, service } = await prepare()
    await expect(
      service.createTemplate({
        ledgerId: ledger.id,
        name: '   ',
        transactionType: 'expense',
        amountMinor: 1000,
      }),
    ).rejects.toThrow('请输入模板名称')
  })

  it('rejects creating a template with non-positive amount', async () => {
    const { ledger, service } = await prepare()
    await expect(
      service.createTemplate({
        ledgerId: ledger.id,
        name: '无效模板',
        transactionType: 'expense',
        amountMinor: 0,
      }),
    ).rejects.toThrow('模板金额必须为正数')
  })

  it('rejects unsupported transaction types', async () => {
    const { ledger, service } = await prepare()
    await expect(
      service.createTemplate({
        ledgerId: ledger.id,
        name: '不支持的类型',
        transactionType: 'opening_balance' as unknown as TransactionTemplateType,
        amountMinor: 1000,
      }),
    ).rejects.toThrow('不支持的模板类型')
  })

  it('updates template fields', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createTemplate({
      ledgerId: ledger.id,
      name: '旧名称',
      transactionType: 'expense',
      amountMinor: 1000,
    })
    await service.updateTemplate({
      ledgerId: ledger.id,
      templateId: id,
      name: '新名称',
      amountMinor: 2000,
      note: '更新后的备注',
    })
    const updated = await service.getTemplate(id)
    expect(updated?.name).toBe('新名称')
    expect(updated?.amountMinor).toBe(2000)
    expect(updated?.note).toBe('更新后的备注')
  })

  it('refuses updating templates from another ledger', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createTemplate({
      ledgerId: ledger.id,
      name: '模板',
      transactionType: 'expense',
      amountMinor: 1000,
    })
    await expect(
      service.updateTemplate({
        ledgerId: 'other-ledger',
        templateId: id,
        name: '新名称',
      }),
    ).rejects.toThrow('模板不存在')
  })

  it('deletes a template', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createTemplate({
      ledgerId: ledger.id,
      name: '待删除',
      transactionType: 'expense',
      amountMinor: 1000,
    })
    await service.deleteTemplate(ledger.id, id)
    const list = await service.listTemplates(ledger.id)
    expect(list).toEqual([])
  })
})
