// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { ReminderType } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import { ReminderService } from './reminder-service'

const fixedNow = '2026-08-03T04:00:00.000Z'
const clock: Clock = { nowIso: () => fixedNow }

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
  const service = new ReminderService(database, ids, clock)
  return { database, ids, ledger, service }
}

describe('ReminderService', () => {
  it('creates a credit card due reminder', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createReminder({
      ledgerId: ledger.id,
      type: 'credit_card_due',
      title: '招商银行信用卡还款日',
      dueDate: '2026-08-20',
      amountMinor: 50000,
      advanceDays: 3,
    })

    const list = await service.listReminders(ledger.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id,
      type: 'credit_card_due',
      title: '招商银行信用卡还款日',
      dueDate: '2026-08-20',
      amountMinor: 50000,
      advanceDays: 3,
      enabled: true,
    })
  })

  it('lists upcoming reminders sorted by days until due', async () => {
    const { ledger, service } = await prepare()
    await service.createReminder({
      ledgerId: ledger.id,
      type: 'custom',
      title: '已到期',
      dueDate: '2026-08-02', // 已过
    })
    await service.createReminder({
      ledgerId: ledger.id,
      type: 'credit_card_due',
      title: '即将到期',
      dueDate: '2026-08-10',
    })
    await service.createReminder({
      ledgerId: ledger.id,
      type: 'receivable_due',
      title: '远期',
      dueDate: '2026-12-31',
    })

    const upcoming = await service.listUpcoming(ledger.id, 30)
    expect(upcoming.map((u) => u.reminder.title)).toEqual(['即将到期'])
    expect(upcoming[0]!.daysUntilDue).toBeGreaterThanOrEqual(7)
    expect(upcoming[0]!.daysUntilDue).toBeLessThanOrEqual(8)
    expect(upcoming[0]!.isAdvance).toBe(true)
  })

  it('rejects unknown reminder types', async () => {
    const { ledger, service } = await prepare()
    await expect(
      service.createReminder({
        ledgerId: ledger.id,
        type: 'unknown' as unknown as ReminderType,
        title: '标题',
        dueDate: '2026-08-10',
      }),
    ).rejects.toThrow('不支持的提醒类型')
  })

  it('rejects empty title', async () => {
    const { ledger, service } = await prepare()
    await expect(
      service.createReminder({
        ledgerId: ledger.id,
        type: 'custom',
        title: '',
        dueDate: '2026-08-10',
      }),
    ).rejects.toThrow('请输入提醒标题')
  })

  it('rejects invalid due date', async () => {
    const { ledger, service } = await prepare()
    await expect(
      service.createReminder({
        ledgerId: ledger.id,
        type: 'custom',
        title: '标题',
        dueDate: 'not-a-date',
      }),
    ).rejects.toThrow('到期日期格式不正确')
  })

  it('rejects negative advance days', async () => {
    const { ledger, service } = await prepare()
    await expect(
      service.createReminder({
        ledgerId: ledger.id,
        type: 'custom',
        title: '标题',
        dueDate: '2026-08-10',
        advanceDays: -1,
      }),
    ).rejects.toThrow('提前天数必须为非负整数')
  })

  it('updates reminder title and due date', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createReminder({
      ledgerId: ledger.id,
      type: 'custom',
      title: '原始标题',
      dueDate: '2026-08-10',
    })
    await service.updateReminder({
      ledgerId: ledger.id,
      reminderId: id,
      title: '新标题',
      dueDate: '2026-09-15',
      enabled: false,
    })
    const list = await service.listReminders(ledger.id)
    expect(list[0]!.title).toBe('新标题')
    expect(list[0]!.dueDate).toBe('2026-09-15')
    expect(list[0]!.enabled).toBe(false)
  })

  it('marks reminder triggered with timestamp', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createReminder({
      ledgerId: ledger.id,
      type: 'custom',
      title: '标题',
      dueDate: '2026-08-10',
    })
    await service.markTriggered(id)
    const list = await service.listReminders(ledger.id)
    expect(list[0]!.lastTriggeredAt).toBe(fixedNow)
  })

  it('deletes a reminder', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createReminder({
      ledgerId: ledger.id,
      type: 'custom',
      title: '待删除',
      dueDate: '2026-08-10',
    })
    await service.deleteReminder(ledger.id, id)
    const list = await service.listReminders(ledger.id)
    expect(list).toEqual([])
  })

  it('refuses operating on reminders from another ledger', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createReminder({
      ledgerId: ledger.id,
      type: 'custom',
      title: '标题',
      dueDate: '2026-08-10',
    })
    await expect(
      service.updateReminder({ ledgerId: 'other', reminderId: id, title: 'x' }),
    ).rejects.toThrow('提醒不存在')
    await expect(service.deleteReminder('other', id)).rejects.toThrow('提醒不存在')
  })
})
