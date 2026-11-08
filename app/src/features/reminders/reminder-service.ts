// AI署名: 豆包 | 2026-11-08 | "标记已处理"改按"期"判定，修窗口外点了没反馈
import { inject, type InjectionKey } from 'vue'

import type {
  ReminderRecurrence,
  ReminderType,
  ReminderWithAccount,
  UpcomingReminder,
} from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import {
  ReminderRepository,
  type CreateReminderInput,
  type UpdateReminderInput,
} from '@/db/repositories/reminder-repository'

export type { CreateReminderInput, UpdateReminderInput }

export interface ReminderServicePort {
  listReminders(ledgerId: string): Promise<readonly ReminderWithAccount[]>
  listUpcoming(ledgerId: string, lookaheadDays?: number): Promise<readonly UpcomingReminder[]>
  createReminder(input: CreateReminderInput): Promise<string>
  updateReminder(input: UpdateReminderInput): Promise<void>
  deleteReminder(ledgerId: string, reminderId: string): Promise<void>
  markTriggered(reminderId: string): Promise<void>
}

export const reminderServiceKey: InjectionKey<ReminderServicePort> = Symbol('reminderService')

const VALID_TYPES: ReadonlySet<ReminderType> = new Set([
  'credit_card_due',
  'prepaid_expiry',
  'receivable_due',
  'custom',
])

const DEFAULT_LOOKAHEAD_DAYS = 30
/** 已过期的非循环提醒在"近期到期"里保留多少天（带"已逾期 X 天"展示）。 */
const OVERDUE_RETENTION_DAYS = 30

// ================================================================
// 纯函数（导出供单测）：循环期次 / 提醒窗口 / 已处理判断
// 全部按"本地日期"计算（dueDate 可能是 'YYYY-MM-DD' 或本地零点的 UTC 偏移串，
// 统一用 Date 的本地字段取日期，避免 UTC 字符串比较的时区错位）。
// ================================================================

/** 取 ISO/日期串的本地日期整数（y*10000+m*100+d），用于比较与算术。 */
function localDateNumber(iso: string): number {
  const d = new Date(iso)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

/** 用本地日期整数构造本地零点 ISO 串（与 RemindersView 的存库格式一致）。 */
function isoFromLocalDateNumber(n: number): string {
  const y = Math.floor(n / 10000)
  const m = Math.floor((n % 10000) / 100)
  const d = n % 100
  return new Date(y, m - 1, d).toISOString()
}

/** 当月最后一天（1~12 月）。 */
function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

/**
 * 循环提醒的下一期到期日（今天或之后最近的一期）；不循环原样返回 dueDate。
 *
 * monthly：以 dueDate 的"日"为锚逐月滚动，短月取当月最后一天（31 号锚点在
 * 2 月取 28/29、4 月取 30）。起点取"锚点月份与当前月份的较晚者"，锚点之前的
 * 月份不产生虚拟期次（提醒创建前的日子不存在"错过"）。
 */
export function nextDueOccurrence(
  reminder: Pick<ReminderWithAccount, 'dueDate' | 'recurrence'>,
  nowIso: string,
): string {
  if (reminder.recurrence !== 'monthly') return reminder.dueDate
  const anchor = new Date(reminder.dueDate)
  const anchorDay = anchor.getDate()
  const now = new Date(nowIso)
  // 起点：锚点月份与当前月份中较晚的一个
  const start =
    anchor.getFullYear() * 12 + anchor.getMonth() >= now.getFullYear() * 12 + now.getMonth()
      ? { y: anchor.getFullYear(), m: anchor.getMonth() }
      : { y: now.getFullYear(), m: now.getMonth() }
  for (let i = 0; i < 1200; i++) {
    // 最多向后扫 100 年兜底（正常一两轮内必命中）
    const y = start.y + Math.floor((start.m + i) / 12)
    const m = (start.m + i) % 12
    const day = Math.min(anchorDay, daysInMonth(y, m + 1))
    const candidate = y * 10000 + (m + 1) * 100 + day
    if (candidate >= localDateNumber(nowIso)) {
      return isoFromLocalDateNumber(candidate)
    }
  }
  return reminder.dueDate
}

/**
 * 提醒窗口：[下一到期日 − advanceDays, 下一到期日]。
 * 返回今天是否落在窗口内（首页弹窗/近期到期高亮的判据）。
 */
export function isInReminderWindow(
  reminder: Pick<ReminderWithAccount, 'advanceDays'>,
  nextDueDate: string,
  nowIso: string,
): boolean {
  const days = daysBetweenLocal(nowIso, nextDueDate)
  return days >= 0 && days <= reminder.advanceDays
}

/**
 * 上一期到期日（monthly 用）：本期到期日往前推一个月，日期按锚点日 clamp 到当月最后一天。
 * 例：锚点 31 号、本期 3-31 → 上一期 2-28（闰年 2-29）。
 */
export function previousDueOccurrence(
  reminder: Pick<ReminderWithAccount, 'dueDate'>,
  nextDueDate: string,
): string {
  const anchorDay = new Date(reminder.dueDate).getDate()
  const due = new Date(nextDueDate)
  const prevYear = due.getMonth() === 0 ? due.getFullYear() - 1 : due.getFullYear()
  const prevMonth1 = due.getMonth() === 0 ? 12 : due.getMonth()
  const day = Math.min(anchorDay, daysInMonth(prevYear, prevMonth1))
  return isoFromLocalDateNumber(prevYear * 10000 + prevMonth1 * 100 + day)
}

/**
 * 当前这一期是否已"标记已处理"。
 *
 * 按"期"判定，**不再要求"今天正好落在提前提醒窗口内"**（2026-11-08 改）：
 * 原先还要求 今天 ∈ [到期日−advanceDays, 到期日]，于是"还有 7 天到期、提前 3 天提醒"
 * 的条目点"标记已处理"后虽然写了库，但仍被判定为未处理——按钮不消失、也不显示
 * "本期已处理"，用户看到的就是"点了没反应"。
 *
 * - 本期区间：(上一期到期日, 本期到期日]；一次性提醒没有下界，只要不晚于本期到期日。
 * - 跨期自动恢复：下一期到期日滚到下个月后，上一期的处理记录自然落在区间之外。
 * - lastTriggeredAt 晚于本期到期日或晚于当前时间（改期 / 时钟异常）→ 视为未处理。
 */
export function isHandledInCurrentPeriod(
  reminder: Pick<ReminderWithAccount, 'recurrence' | 'dueDate' | 'lastTriggeredAt'>,
  nextDueDate: string,
  nowIso: string,
): boolean {
  if (!reminder.lastTriggeredAt) return false
  const trigger = localDateNumber(reminder.lastTriggeredAt)
  if (trigger > localDateNumber(nextDueDate)) return false
  if (trigger > localDateNumber(nowIso)) return false
  if (reminder.recurrence !== 'monthly') return true
  return trigger > localDateNumber(previousDueOccurrence(reminder, nextDueDate))
}

/** 两个时刻之间的本地日期差（天）。 */
function daysBetweenLocal(fromIso: string, toIso: string): number {
  const a = new Date(fromIso)
  const b = new Date(toIso)
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bUtc - aUtc) / (24 * 60 * 60 * 1000))
}

export class ReminderService implements ReminderServicePort {
  private readonly reminders: ReminderRepository

  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.reminders = new ReminderRepository(database)
  }

  listReminders(ledgerId: string): Promise<readonly ReminderWithAccount[]> {
    return this.reminders.listByLedger(ledgerId)
  }

  /**
   * 近期到期列表：按"下一到期日"计算（循环提醒每月滚动）。
   * 窗口：未来 lookaheadDays 天内的期次；不循环的已过期项保留
   * OVERDUE_RETENTION_DAYS 天（"已逾期 X 天"展示，不再凭空消失）。
   */
  async listUpcoming(
    ledgerId: string,
    lookaheadDays: number = DEFAULT_LOOKAHEAD_DAYS,
  ): Promise<readonly UpcomingReminder[]> {
    const nowIso = this.clock.nowIso()
    const enabled = await this.reminders.listEnabledByLedger(ledgerId)
    const items: UpcomingReminder[] = []
    for (const reminder of enabled) {
      const nextDueDate = nextDueOccurrence(reminder, nowIso)
      const daysUntilDue = daysBetweenLocal(nowIso, nextDueDate)
      if (daysUntilDue > lookaheadDays) continue
      if (reminder.recurrence !== 'monthly' && daysUntilDue < -OVERDUE_RETENTION_DAYS) continue
      items.push({
        reminder,
        daysUntilDue,
        isAdvance: daysUntilDue > 0,
        nextDueDate,
        isHandled: isHandledInCurrentPeriod(reminder, nextDueDate, nowIso),
      })
    }
    return items.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
  }

  async createReminder(input: CreateReminderInput): Promise<string> {
    if (!VALID_TYPES.has(input.type)) {
      throw new Error(`不支持的提醒类型：${input.type}`)
    }
    const title = requiredText(input.title, '请输入提醒标题')
    assertDate(input.dueDate, '到期日期')
    const advanceDays = input.advanceDays ?? 3
    if (!Number.isSafeInteger(advanceDays) || advanceDays < 0) {
      throw new Error('提前天数必须为非负整数')
    }
    if (input.amountMinor !== undefined && input.amountMinor < 0) {
      throw new Error('提醒金额不能为负数')
    }
    const recurrence: ReminderRecurrence = input.recurrence === 'monthly' ? 'monthly' : 'none'
    const now = this.clock.nowIso()
    const id = this.ids.next('reminder')
    await this.reminders.create({
      id,
      ledgerId: input.ledgerId,
      type: input.type,
      accountId: optionalText(input.accountId),
      title,
      dueDate: input.dueDate,
      amountMinor: input.amountMinor,
      advanceDays,
      recurrence,
      enabled: input.enabled ?? true,
      managedBy: input.managedBy,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async updateReminder(input: UpdateReminderInput): Promise<void> {
    const existing = await this.reminders.findById(input.reminderId)
    if (!existing || existing.ledgerId !== input.ledgerId) {
      throw new Error('提醒不存在')
    }
    if (input.title !== undefined) {
      requiredText(input.title, '提醒标题不能为空')
    }
    if (input.dueDate !== undefined) {
      assertDate(input.dueDate, '到期日期')
    }
    if (
      input.advanceDays !== undefined &&
      (input.advanceDays < 0 || !Number.isSafeInteger(input.advanceDays))
    ) {
      throw new Error('提前天数必须为非负整数')
    }
    if (input.amountMinor !== undefined && input.amountMinor < 0) {
      throw new Error('提醒金额不能为负数')
    }
    await this.reminders.update(
      input.reminderId,
      {
        title: input.title,
        dueDate: input.dueDate,
        amountMinor: input.amountMinor,
        advanceDays: input.advanceDays,
        recurrence:
          input.recurrence === 'monthly'
            ? 'monthly'
            : input.recurrence === 'none'
              ? 'none'
              : undefined,
        enabled: input.enabled,
      },
      this.clock.nowIso(),
    )
  }

  async deleteReminder(ledgerId: string, reminderId: string): Promise<void> {
    const existing = await this.reminders.findById(reminderId)
    if (!existing || existing.ledgerId !== ledgerId) {
      throw new Error('提醒不存在')
    }
    await this.reminders.delete(reminderId)
  }

  async markTriggered(reminderId: string): Promise<void> {
    await this.reminders.markTriggered(reminderId, this.clock.nowIso())
  }
}

export function useReminderService(): ReminderServicePort | undefined {
  return inject(reminderServiceKey, undefined)
}

function requiredText(value: string, message: string): string {
  const text = value.trim()
  if (text === '') {
    throw new Error(message)
  }
  return text
}

function optionalText(value: string | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

function assertDate(value: string, label: string): void {
  if (value.trim() === '' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label}格式不正确`)
  }
}
