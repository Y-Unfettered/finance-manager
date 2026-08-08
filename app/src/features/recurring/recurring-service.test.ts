// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import type { RecurringFrequency } from '@/domain/entities'
import type { SqliteExecutor } from '@/db/core/types'
import { runMigrations } from '@/db/migration-runner'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { TemplateRepository } from '@/db/repositories/template-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { TemplateService } from '@/features/templates/template-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { RecurringService } from './recurring-service'

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
  const templateService = new TemplateService(database, ids, clock)
  const recurringService = new RecurringService(database, ids, clock)
  const templates = new TemplateRepository(database)
  return { database, ids, ledger, templateService, recurringService, templates }
}

describe('RecurringService', () => {
  it('creates a recurring transaction linked to a template', async () => {
    const { ledger, templateService, recurringService } = await prepare()
    const templateId = await templateService.createTemplate({
      ledgerId: ledger.id,
      name: '房租',
      transactionType: 'expense',
      amountMinor: 30000,
    })
    const id = await recurringService.createRecurring({
      ledgerId: ledger.id,
      templateId,
      frequency: 'monthly',
      intervalValue: 1,
      nextOccurrenceAt: '2026-09-01T00:00:00.000Z',
    })

    const list = await recurringService.listRecurring(ledger.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id,
      templateName: '房租',
      transactionType: 'expense',
      amountMinor: 30000,
      frequency: 'monthly',
      intervalValue: 1,
      enabled: true,
    })
  })

  it('lists only due recurring transactions by cutoff time', async () => {
    const { ledger, templateService, recurringService } = await prepare()
    const tplId = await templateService.createTemplate({
      ledgerId: ledger.id,
      name: '订阅',
      transactionType: 'expense',
      amountMinor: 5000,
    })
    await recurringService.createRecurring({
      ledgerId: ledger.id,
      templateId: tplId,
      frequency: 'daily',
      nextOccurrenceAt: '2026-08-01T00:00:00.000Z',
    })
    await recurringService.createRecurring({
      ledgerId: ledger.id,
      templateId: tplId,
      frequency: 'daily',
      nextOccurrenceAt: '2026-12-31T00:00:00.000Z',
    })

    const due = await recurringService.listDue(ledger.id, '2026-08-03T04:00:00.000Z')
    expect(due).toHaveLength(1)
    expect(due[0]!.nextOccurrenceAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('rejects creating recurring without an existing template', async () => {
    const { ledger, recurringService } = await prepare()
    await expect(
      recurringService.createRecurring({
        ledgerId: ledger.id,
        templateId: 'missing',
        frequency: 'daily',
        nextOccurrenceAt: '2026-08-04T00:00:00.000Z',
      }),
    ).rejects.toThrow('模板不存在')
  })

  it('rejects invalid frequency', async () => {
    const { ledger, templateService, recurringService } = await prepare()
    const tplId = await templateService.createTemplate({
      ledgerId: ledger.id,
      name: '模板',
      transactionType: 'expense',
      amountMinor: 1000,
    })
    await expect(
      recurringService.createRecurring({
        ledgerId: ledger.id,
        templateId: tplId,
        frequency: 'hourly' as unknown as RecurringFrequency,
        nextOccurrenceAt: '2026-08-04T00:00:00.000Z',
      }),
    ).rejects.toThrow('不支持的频率')
  })

  it('rejects non-positive interval', async () => {
    const { ledger, templateService, recurringService } = await prepare()
    const tplId = await templateService.createTemplate({
      ledgerId: ledger.id,
      name: '模板',
      transactionType: 'expense',
      amountMinor: 1000,
    })
    await expect(
      recurringService.createRecurring({
        ledgerId: ledger.id,
        templateId: tplId,
        frequency: 'weekly',
        intervalValue: 0,
        nextOccurrenceAt: '2026-08-04T00:00:00.000Z',
      }),
    ).rejects.toThrow('间隔必须为正整数')
  })

  it('updates recurring fields and toggles enabled', async () => {
    const { ledger, templateService, recurringService } = await prepare()
    const tplId = await templateService.createTemplate({
      ledgerId: ledger.id,
      name: '工资',
      transactionType: 'income',
      amountMinor: 80000,
    })
    const id = await recurringService.createRecurring({
      ledgerId: ledger.id,
      templateId: tplId,
      frequency: 'monthly',
      nextOccurrenceAt: '2026-09-01T00:00:00.000Z',
    })

    await recurringService.updateRecurring({
      ledgerId: ledger.id,
      recurringId: id,
      enabled: false,
      nextOccurrenceAt: '2026-10-01T00:00:00.000Z',
    })

    const list = await recurringService.listRecurring(ledger.id)
    expect(list[0]!.enabled).toBe(false)
    expect(list[0]!.nextOccurrenceAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('deletes a recurring transaction', async () => {
    const { ledger, templateService, recurringService } = await prepare()
    const tplId = await templateService.createTemplate({
      ledgerId: ledger.id,
      name: '模板',
      transactionType: 'expense',
      amountMinor: 1000,
    })
    const id = await recurringService.createRecurring({
      ledgerId: ledger.id,
      templateId: tplId,
      frequency: 'daily',
      nextOccurrenceAt: '2026-08-04T00:00:00.000Z',
    })
    await recurringService.deleteRecurring(ledger.id, id)
    const list = await recurringService.listRecurring(ledger.id)
    expect(list).toEqual([])
  })

  it('computeNextOccurrence advances by frequency and interval', () => {
    const svc = new RecurringService(
      {} as unknown as SqliteExecutor,
      {} as unknown as IdGenerator,
      clock,
    )
    expect(svc.computeNextOccurrence('daily', 1, '2026-08-03T00:00:00.000Z')).toBe(
      '2026-08-04T00:00:00.000Z',
    )
    expect(svc.computeNextOccurrence('weekly', 2, '2026-08-03T00:00:00.000Z')).toBe(
      '2026-08-17T00:00:00.000Z',
    )
    expect(svc.computeNextOccurrence('monthly', 1, '2026-08-03T00:00:00.000Z')).toBe(
      '2026-09-03T00:00:00.000Z',
    )
    expect(
      svc.computeNextOccurrence('daily', 1, '2026-08-03T00:00:00.000Z', '2026-08-04T00:00:00.000Z'),
    ).toBe('2026-08-04T00:00:00.000Z')
    expect(
      svc.computeNextOccurrence('daily', 1, '2026-08-03T00:00:00.000Z', '2026-08-03T23:00:00.000Z'),
    ).toBe(undefined)
  })
})
