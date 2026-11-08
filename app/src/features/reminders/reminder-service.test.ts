// @vitest-environment node
// AI署名: 豆包 | 2026-11-08 | 已处理判定改按"期"，用例同步更新
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { ReminderType } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

import {
  isHandledInCurrentPeriod,
  isInReminderWindow,
  nextDueOccurrence,
  previousDueOccurrence,
  ReminderService,
} from './reminder-service'

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

  it('lists upcoming reminders sorted by days until due（过期项保留在列首）', async () => {
    const { ledger, service } = await prepare()
    await service.createReminder({
      ledgerId: ledger.id,
      type: 'custom',
      title: '已到期',
      dueDate: '2026-08-02', // 已过 1 天：不循环过期项保留展示（v20 起）
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
    expect(upcoming.map((u) => u.reminder.title)).toEqual(['已到期', '即将到期'])
    expect(upcoming[0]!.daysUntilDue).toBeLessThan(0)
    expect(upcoming[1]!.daysUntilDue).toBeGreaterThanOrEqual(7)
    expect(upcoming[1]!.daysUntilDue).toBeLessThanOrEqual(8)
    expect(upcoming[1]!.isAdvance).toBe(true)
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

// ---------- 循环期次 / 提醒窗口 / 已处理（纯函数） ----------
//
// 注意：机器时区为 UTC+8，'2026-08-20' 解析为本地 08-20 00:00。
// fixedNow = '2026-08-03T04:00:00.000Z' → 本地 2026-08-03 12:00，本地日期 08-03。

describe('nextDueOccurrence', () => {
  it('none 循环原样返回到期日', () => {
    expect(nextDueOccurrence({ dueDate: '2026-08-20', recurrence: 'none' }, fixedNow)).toBe(
      '2026-08-20',
    )
  })

  it('monthly：当期未过取当期', () => {
    // 锚 08-20，今天 08-03 → 本期 08-20
    expect(nextDueOccurrence({ dueDate: '2026-08-20', recurrence: 'monthly' }, fixedNow)).toBe(
      '2026-08-19T16:00:00.000Z', // 本地 2026-08-20
    )
  })

  it('monthly：当期已过滚动到下月', () => {
    // 锚 08-01，今天 08-03 → 09-01
    expect(nextDueOccurrence({ dueDate: '2026-08-01', recurrence: 'monthly' }, fixedNow)).toBe(
      '2026-08-31T16:00:00.000Z', // 本地 2026-09-01
    )
  })

  it('monthly：今天恰为到期日取今天（当天仍在窗口内要提醒）', () => {
    // 锚 08-03，今天 08-03 → 本期 08-03
    expect(nextDueOccurrence({ dueDate: '2026-08-03', recurrence: 'monthly' }, fixedNow)).toBe(
      '2026-08-02T16:00:00.000Z', // 本地 2026-08-03
    )
  })

  it('monthly：31 号锚点在短月取当月最后一天', () => {
    const feb = nextDueOccurrence(
      { dueDate: '2026-01-31', recurrence: 'monthly' },
      '2026-02-05T04:00:00.000Z',
    )
    expect(new Date(feb).getDate()).toBe(28) // 2026 非闰年 → 2 月 28
    const apr = nextDueOccurrence(
      { dueDate: '2026-01-31', recurrence: 'monthly' },
      '2026-04-05T04:00:00.000Z',
    )
    expect(new Date(apr).getDate()).toBe(30) // 4 月 → 30
  })

  it('monthly：29 号锚点在闰年 2 月取 29、平年取 28', () => {
    const leap = nextDueOccurrence(
      { dueDate: '2027-01-29', recurrence: 'monthly' },
      '2028-02-05T04:00:00.000Z',
    )
    expect(new Date(leap).getDate()).toBe(29) // 2028 闰年
  })

  it('monthly：锚点在未来月份时不产生更早的期次（今天早于锚点整月）', () => {
    // 锚 11-08，今天 08-03 → 11-08（8 月/9 月/10 月的 8 号在锚点之前，不存在）
    expect(nextDueOccurrence({ dueDate: '2026-11-08', recurrence: 'monthly' }, fixedNow)).toBe(
      '2026-11-07T16:00:00.000Z', // 本地 2026-11-08
    )
  })
})

describe('isInReminderWindow', () => {
  const now = '2026-11-10T04:00:00.000Z' // 本地 2026-11-10
  const due = '2026-11-12T16:00:00.000Z' // 本地 2026-11-13

  it('提前天数窗口内（首日与到期当天）为 true', () => {
    expect(isInReminderWindow({ advanceDays: 3 }, due, now)).toBe(true) // 差 3 天（窗口首日）
    expect(isInReminderWindow({ advanceDays: 3 }, due, '2026-11-12T04:00:00.000Z')).toBe(true) // 差 1 天
    expect(isInReminderWindow({ advanceDays: 3 }, due, '2026-11-13T04:00:00.000Z')).toBe(true) // 到期当天
  })

  it('窗口外（差 4 天 / 已过期）为 false', () => {
    expect(isInReminderWindow({ advanceDays: 3 }, due, '2026-11-09T04:00:00.000Z')).toBe(false)
    expect(isInReminderWindow({ advanceDays: 3 }, due, '2026-11-15T04:00:00.000Z')).toBe(false)
  })
})

describe('previousDueOccurrence', () => {
  it('短月按锚点日 clamp（31 号的 3 月 → 2 月 28 日）', () => {
    const prev = previousDueOccurrence(
      { dueDate: '2026-03-30T16:00:00.000Z' }, // 本地 3-31，锚点日 31
      '2026-03-30T16:00:00.000Z', // 本期本地 3-31
    )
    const d = new Date(prev)
    expect(d.getMonth() + 1).toBe(2)
    expect(d.getDate()).toBe(28)
  })
})

describe('isHandledInCurrentPeriod', () => {
  const now = '2026-11-10T04:00:00.000Z' // 本地 11-10
  const dueIn3 = '2026-11-12T16:00:00.000Z' // 本地 11-13（提前 3 天窗口内）
  const dueIn7 = '2026-11-16T16:00:00.000Z' // 本地 11-17（提前 3 天的窗口外）
  const anchorDueIn3 = '2026-11-12T16:00:00.000Z' // 锚点日 13
  const anchorDueIn7 = '2026-11-16T16:00:00.000Z' // 锚点日 17
  const triggerToday = '2026-11-10T04:00:00.000Z' // 本地 11-10
  const triggerLastPeriod = '2026-10-12T16:00:00.000Z' // 本地 10-13（= 上一期到期日当天）

  it('窗口外标记（还有 7 天到期）也算本期已处理（回归：点了没反应）', () => {
    expect(
      isHandledInCurrentPeriod(
        { recurrence: 'monthly', dueDate: anchorDueIn7, lastTriggeredAt: triggerToday },
        dueIn7,
        now,
      ),
    ).toBe(true)
  })

  it('本期窗口内标记 → 已处理', () => {
    expect(
      isHandledInCurrentPeriod(
        { recurrence: 'monthly', dueDate: anchorDueIn3, lastTriggeredAt: triggerToday },
        dueIn3,
        now,
      ),
    ).toBe(true)
  })

  it('lastTriggeredAt 是上一期（不晚于上期到期日）→ 未处理', () => {
    expect(
      isHandledInCurrentPeriod(
        { recurrence: 'monthly', dueDate: anchorDueIn3, lastTriggeredAt: triggerLastPeriod },
        dueIn3,
        now,
      ),
    ).toBe(false)
  })

  it('下个月的新一期自动恢复提醒', () => {
    // 本期滚到本地 12-13（上一期到期日 = 11-13），11-10 的处理记录落在上一期区间 → 未处理
    expect(
      isHandledInCurrentPeriod(
        { recurrence: 'monthly', dueDate: anchorDueIn3, lastTriggeredAt: triggerToday },
        '2026-12-12T16:00:00.000Z',
        now,
      ),
    ).toBe(false)
  })

  it('一次性提醒：标记后即本期已处理（没有下界）', () => {
    expect(
      isHandledInCurrentPeriod(
        { recurrence: 'none', dueDate: anchorDueIn7, lastTriggeredAt: triggerToday },
        dueIn7,
        now,
      ),
    ).toBe(true)
  })

  it('无 lastTriggeredAt → 未处理', () => {
    expect(
      isHandledInCurrentPeriod({ recurrence: 'monthly', dueDate: anchorDueIn3 }, dueIn3, now),
    ).toBe(false)
  })

  it('处理记录晚于本期到期日 / 晚于当前时间（改期或时钟异常）→ 未处理', () => {
    expect(
      isHandledInCurrentPeriod(
        { recurrence: 'none', dueDate: anchorDueIn3, lastTriggeredAt: '2026-11-20T04:00:00.000Z' },
        dueIn3,
        now,
      ),
    ).toBe(false)
  })
})

describe('ReminderService 循环提醒', () => {
  it('monthly 提醒按下一期计算且写入循环标记', async () => {
    const { ledger, service } = await prepare()
    await service.createReminder({
      ledgerId: ledger.id,
      type: 'credit_card_due',
      title: '花呗还款',
      dueDate: '2026-08-08', // 本地 08-08；fixedNow 本地 08-03 → 本期 08-08
      advanceDays: 3,
      recurrence: 'monthly',
    })
    const upcoming = await service.listUpcoming(ledger.id, 30)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]!.reminder.recurrence).toBe('monthly')
    expect(new Date(upcoming[0]!.nextDueDate).getDate()).toBe(8)
    expect(upcoming[0]!.daysUntilDue).toBe(5)
    expect(upcoming[0]!.isHandled).toBe(false)
  })

  it('标记已处理后当期 isHandled=true（窗口外也能标记，不需先把到期日改近）', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createReminder({
      ledgerId: ledger.id,
      type: 'credit_card_due',
      title: '抖音月付还款',
      dueDate: '2026-08-11', // 本地 08-11：今天 08-03，还剩 8 天，提前 3 天的窗口外
      advanceDays: 3,
      recurrence: 'monthly',
    })
    await service.markTriggered(id)
    const upcoming = await service.listUpcoming(ledger.id, 30)
    expect(upcoming[0]!.isHandled).toBe(true)
    expect(upcoming[0]!.daysUntilDue).toBe(8)
  })

  it('不循环的已过期提醒保留展示（不再凭空消失）', async () => {
    const { ledger, service } = await prepare()
    await service.createReminder({
      ledgerId: ledger.id,
      type: 'receivable_due',
      title: '借出回收',
      dueDate: '2026-07-25', // 过期 9 天
    })
    const upcoming = await service.listUpcoming(ledger.id, 30)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]!.daysUntilDue).toBeLessThan(0)
    expect(upcoming[0]!.isAdvance).toBe(false)
  })

  it('更新时可切换循环方式', async () => {
    const { ledger, service } = await prepare()
    const id = await service.createReminder({
      ledgerId: ledger.id,
      type: 'custom',
      title: '标题',
      dueDate: '2026-08-10',
    })
    await service.updateReminder({ ledgerId: ledger.id, reminderId: id, recurrence: 'monthly' })
    expect((await service.listReminders(ledger.id))[0]!.recurrence).toBe('monthly')
    await service.updateReminder({ ledgerId: ledger.id, reminderId: id, recurrence: 'none' })
    expect((await service.listReminders(ledger.id))[0]!.recurrence).toBe('none')
  })
})
