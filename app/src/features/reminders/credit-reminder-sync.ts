/**
 * 信用卡账期 ↔ 还款提醒 的同步服务（2026-11-08 需求）。
 *
 * 一句话：账户的 `credit_profiles`（出账日/还款日/提前提醒天数）是唯一事实来源，
 * 提醒只是它的投影——建卡/改账期时自动生成或更新一条 `credit_card_due` + `monthly`
 * 的提醒；账期被清空、账户归档/删除时，提醒跟着消失或停用。
 *
 * 边界（很重要）：
 * - 只操作 `managed_by = 'credit_profile'` 的提醒，用户手工建的提醒（managed_by 为空）
 *   永远不会被这套逻辑改、停或删。
 * - 只在"账期值真的变了"时才重新锚定到期日，用户手工改过的到期日不会被普通编辑覆盖。
 * - 存量账户靠 `backfillOnce()` 一次性补建（app_settings 打标记），
 *   所以用户在提醒页删掉自动提醒后，重启 APP 不会再冒出来（只有改账期时才会重建）。
 */
import type { CreditProfileRecord, ReminderRecord } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import { AppSettingsRepository } from '@/db/repositories/app-settings-repository'
import { AccountProfileRepository, type CreditProfileWithAccount } from '@/db/repositories/account-profile-repository'
import { ReminderRepository } from '@/db/repositories/reminder-repository'
import { getLogger } from '@/features/debug/app-logger'

import {
  creditRepaymentReminderTitle,
  hasCompleteCreditCycle,
  nextRepaymentDueDate,
} from './credit-repayment'

const log = getLogger('reminder')

/** 自动生成提醒的来源标记（同时是 reminders.managed_by 的取值）。 */
const CREDIT_PROFILE_SOURCE = 'credit_profile' as const
/** 一次性回填的完成标记：值带版本号，将来规则变化可写 v2 重跑。 */
const BACKFILL_KEY = 'credit_repayment_reminder_backfill'
const BACKFILL_VERSION = 'v1'

export interface CreditAccountSnapshot {
  accountId: string
  ledgerId: string
  accountName: string
  /** 最新的账期（创建/编辑后的状态）。缺 billDay 或 repaymentDay 视为账期不全 → 删除自动提醒。 */
  profile?: Pick<CreditProfileRecord, 'billDay' | 'repaymentDay' | 'reminderDays'>
  /** 编辑前的账期：用来判断"还款日/提前天数是否真的变了"，未变则不动现有提醒。 */
  previousProfile?: Pick<CreditProfileRecord, 'billDay' | 'repaymentDay' | 'reminderDays'>
  /** 编辑前的账户名：判断提醒标题是否仍是自动生成的旧标题（用户改过标题就保留）。 */
  previousAccountName?: string
  /** 当前账户是否已归档：新建/回填时据此决定初始启用状态（归档账户的提醒建出来即停用）。 */
  archived?: boolean
  /**
   * 是否把归档状态落成 enabled。
   * 归档/恢复账户传 true；普通编辑账户传 false/不传，避免覆盖用户在提醒页手动关掉的开关。
   */
  syncEnabled?: boolean
}

export class CreditRepaymentReminderService {
  private readonly reminders: ReminderRepository
  private readonly profiles: AccountProfileRepository
  private readonly settings: AppSettingsRepository

  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.reminders = new ReminderRepository(database)
    this.profiles = new AccountProfileRepository(database)
    this.settings = new AppSettingsRepository(database)
  }

  /**
   * 把某账户的账期同步成一条自动还款提醒；返回提醒 id（账期不全并删除时返回 undefined）。
   * 幂等：重复调用只会更新同一条（按 account_id + managed_by 定位）。
   */
  async syncForAccount(snapshot: CreditAccountSnapshot): Promise<string | undefined> {
    const existing = await this.reminders.findByAccountManagedBy(
      snapshot.accountId,
      CREDIT_PROFILE_SOURCE,
    )
    const profile = snapshot.profile
    if (!profile || !hasCompleteCreditCycle(profile)) {
      // 账期被清空（或从来只有出账日）：自动提醒失去意义，直接清掉
      if (existing) {
        await this.reminders.delete(existing.id)
        log.info('creditReminder: removed (cycle incomplete)', {
          accountId: snapshot.accountId,
          reminderId: existing.id,
        })
      }
      return undefined
    }

    const repaymentDay = profile.repaymentDay as number
    const now = this.clock.nowIso()
    const title = creditRepaymentReminderTitle(snapshot.accountName)
    const advanceDays = profile.reminderDays
    const enabled = snapshot.archived !== true

    if (!existing) {
      const id = this.ids.next('reminder')
      const dueDate = nextRepaymentDueDate(repaymentDay, now)
      await this.reminders.create({
        id,
        ledgerId: snapshot.ledgerId,
        type: 'credit_card_due',
        accountId: snapshot.accountId,
        title,
        dueDate,
        advanceDays,
        recurrence: 'monthly',
        enabled,
        managedBy: CREDIT_PROFILE_SOURCE,
        createdAt: now,
        updatedAt: now,
      })
      log.info('creditReminder: created', {
        accountId: snapshot.accountId,
        reminderId: id,
        dueDate,
        advanceDays,
      })
      return id
    }

    const fields = this.buildUpdateFields(existing, snapshot, title, advanceDays, enabled, now)
    if (Object.keys(fields).length > 0) {
      await this.reminders.update(existing.id, fields, now)
      log.info('creditReminder: updated', { accountId: snapshot.accountId, reminderId: existing.id, fields: Object.keys(fields) })
    }
    return existing.id
  }

  /** 账户被彻底删除时清掉自动提醒（不依赖 FK 是否生效）。 */
  async removeForAccount(accountId: string): Promise<void> {
    const existing = await this.reminders.findByAccountManagedBy(
      accountId,
      CREDIT_PROFILE_SOURCE,
    )
    if (!existing) return
    await this.reminders.delete(existing.id)
    log.info('creditReminder: removed with account', { accountId, reminderId: existing.id })
  }

  /**
   * 存量账户一次性回填：升级后首次启动，为"出账日+还款日都填了"的信用账户补建提醒。
   * 已经有自动提醒的账户跳过（不覆盖用户改过的标题/日期）。
   * 完成后写 app_settings 标记，之后不再执行；个别账户失败则不写标记，下次启动再试。
   */
  async backfillOnce(): Promise<number> {
    const applied = await this.settings.get(BACKFILL_KEY)
    if (applied === BACKFILL_VERSION) return 0

    let items: CreditProfileWithAccount[]
    try {
      items = await this.profiles.listCreditProfilesWithAccounts()
    } catch (error) {
      log.error('creditReminder: backfill query failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return 0
    }

    let created = 0
    let failed = 0
    for (const item of items) {
      if (!hasCompleteCreditCycle(item.profile)) continue
      try {
        const existing = await this.reminders.findByAccountManagedBy(
          item.accountId,
          CREDIT_PROFILE_SOURCE,
        )
        if (existing) continue
        const now = this.clock.nowIso()
        await this.reminders.create({
          id: this.ids.next('reminder'),
          ledgerId: item.ledgerId,
          type: 'credit_card_due',
          accountId: item.accountId,
          title: creditRepaymentReminderTitle(item.accountName),
          dueDate: nextRepaymentDueDate(item.profile.repaymentDay as number, now),
          advanceDays: item.profile.reminderDays,
          recurrence: 'monthly',
          enabled: item.archivedAt === undefined,
          managedBy: CREDIT_PROFILE_SOURCE,
          createdAt: now,
          updatedAt: now,
        })
        created += 1
      } catch (error) {
        failed += 1
        log.error('creditReminder: backfill item failed', {
          accountId: item.accountId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (failed > 0) {
      // 有失败项：不写标记，下次启动再试（已建好的会被"已存在"跳过，不会重复）
      log.warn('creditReminder: backfill partially failed', { created, failed })
      return created
    }
    await this.settings.set(BACKFILL_KEY, BACKFILL_VERSION, this.clock.nowIso())
    log.info('creditReminder: backfill done', { created })
    return created
  }

  /**
   * 计算"需要写回的字段"：逐项与现有提醒比对，只有真的变了才更新
   * （避免每次编辑账户都无谓刷新 updated_at，也避免覆盖用户手改的到期日/天数/标题）。
   */
  private buildUpdateFields(
    existing: ReminderRecord,
    snapshot: CreditAccountSnapshot,
    title: string,
    advanceDays: number,
    enabled: boolean,
    nowIso: string,
  ): {
    title?: string
    dueDate?: string
    advanceDays?: number
    enabled?: boolean
    lastTriggeredAt?: string | null
  } {
    const fields: {
      title?: string
      dueDate?: string
      advanceDays?: number
      enabled?: boolean
      lastTriggeredAt?: string | null
    } = {}

    // 标题：只有"仍是上一次自动生成的标题"时才跟着账户名改；用户改过就保留
    const previousTitle = snapshot.previousAccountName
      ? creditRepaymentReminderTitle(snapshot.previousAccountName)
      : undefined
    if (previousTitle === undefined || existing.title === previousTitle) {
      if (existing.title !== title) fields.title = title
    }

    // 到期日：只有还款日变了才重新锚定；没变则保留（可能是用户手改的日期）
    const repaymentDayChanged =
      snapshot.previousProfile === undefined ||
      snapshot.previousProfile.repaymentDay !== snapshot.profile?.repaymentDay
    if (repaymentDayChanged) {
      const nextDueDate = nextRepaymentDueDate(snapshot.profile?.repaymentDay as number, nowIso)
      if (existing.dueDate !== nextDueDate) {
        fields.dueDate = nextDueDate
        // 到期日重锚等于进入新的还款期次：旧的"本期已处理"标记必须清掉，
        // 否则新日期会直接显示"本期已处理"、也不再弹窗（2026-11-08 实测场景）
        if (existing.lastTriggeredAt !== undefined) fields.lastTriggeredAt = null
      }
    }

    // 提前天数：账期里的"提前提醒"变了才同步；否则保留用户手改的值
    if (snapshot.previousProfile === undefined || snapshot.previousProfile.reminderDays !== advanceDays) {
      if (existing.advanceDays !== advanceDays) fields.advanceDays = advanceDays
    }

    // 启用状态：只有归档/恢复账户这类明确动作才落 enabled
    if (snapshot.syncEnabled === true && existing.enabled !== enabled) {
      fields.enabled = enabled
    }

    return fields
  }
}
