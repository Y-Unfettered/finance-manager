import { inject, type InjectionKey } from 'vue'

import type { ReminderType, ReminderWithAccount, UpcomingReminder } from '@/domain/entities'
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

  async listUpcoming(
    ledgerId: string,
    lookaheadDays: number = DEFAULT_LOOKAHEAD_DAYS,
  ): Promise<readonly UpcomingReminder[]> {
    const nowIso = this.clock.nowIso()
    const today = todayDateString(nowIso)
    const reminders = await this.reminders.listUpcoming(ledgerId, today, lookaheadDays)
    const now = new Date(nowIso)
    return reminders
      .map((reminder) => ({
        reminder,
        daysUntilDue: daysBetween(now, new Date(reminder.dueDate)),
        isAdvance: daysBetween(now, new Date(reminder.dueDate)) > 0,
      }))
      .filter((item) => item.daysUntilDue >= 0)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
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
      enabled: input.enabled ?? true,
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

function todayDateString(iso: string): string {
  return iso.slice(0, 10)
}

function daysBetween(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bUtc - aUtc) / (24 * 60 * 60 * 1000))
}
