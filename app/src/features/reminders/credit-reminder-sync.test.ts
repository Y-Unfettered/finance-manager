// @vitest-environment node
import type { EntityKind, IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import { runMigrations } from '@/db/migration-runner'
import { AccountProfileRepository } from '@/db/repositories/account-profile-repository'
import { LedgerRepository } from '@/db/repositories/ledger-repository'
import { ReminderRepository } from '@/db/repositories/reminder-repository'
import { FinanceService } from '@/features/finance/finance-service'
import { LedgerInitializationService } from '@/features/ledger/ledger-initialization-service'
import { NodeSqliteExecutor } from '@/test/node-sqlite-executor'

const clock: Clock = { nowIso: () => '2026-08-03T04:00:00.000Z' }

class SequenceIdGenerator implements IdGenerator {
  private readonly counts = new Map<EntityKind, number>()

  next(kind: EntityKind): string {
    const count = (this.counts.get(kind) ?? 0) + 1
    this.counts.set(kind, count)
    return `${kind}_${count}`
  }
}

/** 本地日期零点 ISO（与提醒存库口径一致）；clock 固定在 2026-08-03 本地 12:00。 */
function localDate(year: number, month1to12: number, day: number): string {
  return new Date(year, month1to12 - 1, day).toISOString()
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
  const reminders = new ReminderRepository(database)
  const profiles = new AccountProfileRepository(database)
  return { database, ids, ledger, service, reminders, profiles }
}

describe('信用卡账期 → 自动还款提醒', () => {
  it('建卡时出账日+还款日都填了 → 自动生成每月同日的还款提醒', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '招商银行信用卡',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
      reminderDays: 3,
    })

    const list = await reminders.listByLedger(ledger.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      type: 'credit_card_due',
      title: '招商银行信用卡还款',
      accountId: account.id,
      accountName: '招商银行信用卡',
      advanceDays: 3,
      recurrence: 'monthly',
      enabled: true,
      managedBy: 'credit_profile',
    })
    expect(list[0]?.dueDate).toBe(localDate(2026, 8, 10))
    // 金额留空（每月应还金额不固定，不做猜测）
    expect(list[0]?.amountMinor).toBeUndefined()
  })

  it('只填出账日、没填还款日 → 不生成提醒（账期不全）', async () => {
    const { ledger, service, reminders } = await prepare()
    await service.createAccount({
      ledgerId: ledger.id,
      name: '京东白条',
      type: 'credit_card',
      billDay: 20,
    })
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(0)
  })

  it('非信用账户（银行储蓄卡）不生成还款提醒', async () => {
    const { ledger, service, reminders } = await prepare()
    await service.createAccount({ ledgerId: ledger.id, name: '工资卡', type: 'bank' })
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(0)
  })

  it('改还款日 → 同一条提醒重新锚定，不新增第二条', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })
    await service.updateAccount({
      ledgerId: ledger.id,
      accountId: account.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 15,
    })

    const list = await reminders.listByLedger(ledger.id)
    expect(list).toHaveLength(1)
    expect(list[0]?.dueDate).toBe(localDate(2026, 8, 15))
  })

  it('改还款日会清掉"本期已处理"标记，避免新期次被当成已处理', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })
    const before = await reminders.listByLedger(ledger.id)
    await reminders.markTriggered(before[0]!.id, clock.nowIso())
    expect((await reminders.listByLedger(ledger.id))[0]?.lastTriggeredAt).toBeDefined()

    await service.updateAccount({
      ledgerId: ledger.id,
      accountId: account.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 15,
    })

    const after = await reminders.listByLedger(ledger.id)
    expect(after[0]?.dueDate).toBe(localDate(2026, 8, 15))
    expect(after[0]?.lastTriggeredAt).toBeUndefined()
  })

  it('编辑账户未传提前提醒天数时保留原值（不再被打回 3）', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
      reminderDays: 5,
    })
    await service.updateAccount({
      ledgerId: ledger.id,
      accountId: account.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })

    const list = await reminders.listByLedger(ledger.id)
    expect(list[0]?.advanceDays).toBe(5)
  })

  it('账户改名 → 自动提醒标题跟着改', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })
    await service.updateAccount({
      ledgerId: ledger.id,
      accountId: account.id,
      name: '花呗 PLUS',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })

    expect((await reminders.listByLedger(ledger.id))[0]?.title).toBe('花呗 PLUS还款')
  })

  it('清空还款日 → 自动提醒删除；账户改成非信用类型同样清掉', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })
    await service.updateAccount({
      ledgerId: ledger.id,
      accountId: account.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
    })
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(0)

    // 再填回来会重新生成（账期变了属于明确动作）
    await service.updateAccount({
      ledgerId: ledger.id,
      accountId: account.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(1)

    // 改成储蓄卡（非信用账户）：账期不存在了，提醒连带删除
    await service.updateAccount({
      ledgerId: ledger.id,
      accountId: account.id,
      name: '花呗',
      type: 'bank',
    })
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(0)
  })

  it('归档账户 → 提醒停用；恢复账户 → 重新启用（到期日不变）', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })
    await service.archiveAccount(ledger.id, account.id)
    expect((await reminders.listByLedger(ledger.id))[0]?.enabled).toBe(false)
    expect((await reminders.listByLedger(ledger.id))[0]?.dueDate).toBe(localDate(2026, 8, 10))

    await service.unarchiveAccount(ledger.id, account.id)
    expect((await reminders.listByLedger(ledger.id))[0]?.enabled).toBe(true)
  })

  it('彻底删除账户 → 自动提醒一并消失，不残留孤儿', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })
    await service.deleteAccount(ledger.id, account.id)
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(0)
  })

  it('不碰用户手工建的还款提醒（managed_by 为空）', async () => {
    const { ledger, service, reminders } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '花呗',
      type: 'credit_card',
      billDay: 20,
      repaymentDay: 10,
    })
    // 用户手工加一条绑同一账户的提醒
    await reminders.create({
      id: 'manual_reminder',
      ledgerId: ledger.id,
      type: 'credit_card_due',
      accountId: account.id,
      title: '自己记的还款',
      dueDate: localDate(2026, 8, 25),
      advanceDays: 1,
      recurrence: 'none',
      enabled: true,
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
    })
    await service.archiveAccount(ledger.id, account.id)

    const list = await reminders.listByLedger(ledger.id)
    const manual = list.find((item) => item.id === 'manual_reminder')
    expect(manual?.enabled).toBe(true)
    expect(list.filter((item) => item.managedBy === 'credit_profile')).toHaveLength(1)
  })

  it('存量账户一次性回填：只补建一次，重复启动不重复建', async () => {
    const { ledger, service, reminders, profiles } = await prepare()
    // 模拟老数据：账户已存在、账期后来补齐，但当时没有自动提醒
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '美团月付',
      type: 'credit_card',
    })
    await profiles.saveCreditProfile({
      accountId: account.id,
      creditLimitMinor: 0,
      billDay: 20,
      repaymentDay: 12,
      reminderDays: 3,
      effectiveFrom: clock.nowIso(),
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
    })
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(0)

    await service.backfillCreditReminders()
    const list = await reminders.listByLedger(ledger.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ title: '美团月付还款', managedBy: 'credit_profile' })
    expect(list[0]?.dueDate).toBe(localDate(2026, 8, 12))

    // 第二次启动：标记已写入，什么都不做（用户手动删掉后也不会反弹）
    await service.backfillCreditReminders()
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(1)

    await reminders.delete(list[0]!.id)
    await service.backfillCreditReminders()
    expect(await reminders.listByLedger(ledger.id)).toHaveLength(0)
  })

  it('回填已归档的信用账户 → 建出来的提醒是停用状态', async () => {
    const { ledger, service, reminders, profiles } = await prepare()
    const account = await service.createAccount({
      ledgerId: ledger.id,
      name: '已停用的白条',
      type: 'credit_card',
    })
    await service.archiveAccount(ledger.id, account.id)
    await profiles.saveCreditProfile({
      accountId: account.id,
      creditLimitMinor: 0,
      billDay: 20,
      repaymentDay: 8,
      reminderDays: 3,
      effectiveFrom: clock.nowIso(),
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
    })

    await service.backfillCreditReminders()
    expect((await reminders.listByLedger(ledger.id))[0]?.enabled).toBe(false)
  })
})
