import { inject, type InjectionKey } from 'vue'

import type { RecurringFrequency, RecurringTransactionWithTemplate } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import {
  RecurringRepository,
  type CreateRecurringInput,
  type UpdateRecurringInput,
} from '@/db/repositories/recurring-repository'
import { TemplateRepository } from '@/db/repositories/template-repository'

export type { CreateRecurringInput, UpdateRecurringInput }

export interface RecurringServicePort {
  listRecurring(ledgerId: string): Promise<readonly RecurringTransactionWithTemplate[]>
  listDue(ledgerId: string, atIso?: string): Promise<readonly RecurringTransactionWithTemplate[]>
  createRecurring(input: CreateRecurringInput): Promise<string>
  updateRecurring(input: UpdateRecurringInput): Promise<void>
  deleteRecurring(ledgerId: string, recurringId: string): Promise<void>
}

export const recurringServiceKey: InjectionKey<RecurringServicePort> = Symbol('recurringService')

const FREQUENCY_DAYS: Record<RecurringFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
}

export class RecurringService implements RecurringServicePort {
  private readonly recurring: RecurringRepository
  private readonly templates: TemplateRepository

  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.recurring = new RecurringRepository(database)
    this.templates = new TemplateRepository(database)
  }

  listRecurring(ledgerId: string): Promise<readonly RecurringTransactionWithTemplate[]> {
    return this.recurring.listByLedger(ledgerId)
  }

  listDue(ledgerId: string, atIso?: string): Promise<readonly RecurringTransactionWithTemplate[]> {
    return this.recurring.listDueBefore(ledgerId, atIso ?? this.clock.nowIso())
  }

  async createRecurring(input: CreateRecurringInput): Promise<string> {
    const template = await this.templates.findById(input.templateId)
    if (!template) {
      throw new Error('模板不存在')
    }
    if (template.ledgerId !== input.ledgerId) {
      throw new Error('模板与账本不匹配')
    }
    if (!FREQUENCY_DAYS[input.frequency]) {
      throw new Error(`不支持的频率：${input.frequency}`)
    }
    const interval = input.intervalValue ?? 1
    if (!Number.isSafeInteger(interval) || interval < 1) {
      throw new Error('间隔必须为正整数')
    }
    assertIsoDate(input.nextOccurrenceAt, '下次执行时间')
    if (input.endDate !== undefined) {
      assertIsoDate(input.endDate, '结束日期')
    }
    const now = this.clock.nowIso()
    const id = this.ids.next('recurring')
    await this.recurring.create({
      id,
      ledgerId: input.ledgerId,
      templateId: input.templateId,
      frequency: input.frequency,
      intervalValue: interval,
      nextOccurrenceAt: input.nextOccurrenceAt,
      endDate: input.endDate,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async updateRecurring(input: UpdateRecurringInput): Promise<void> {
    const existing = await this.recurring.findById(input.recurringId)
    if (!existing || existing.ledgerId !== input.ledgerId) {
      throw new Error('周期交易不存在')
    }
    if (input.frequency !== undefined && !FREQUENCY_DAYS[input.frequency]) {
      throw new Error(`不支持的频率：${input.frequency}`)
    }
    if (input.intervalValue !== undefined && input.intervalValue < 1) {
      throw new Error('间隔必须为正整数')
    }
    if (input.nextOccurrenceAt !== undefined) {
      assertIsoDate(input.nextOccurrenceAt, '下次执行时间')
    }
    if (input.endDate !== undefined) {
      assertIsoDate(input.endDate, '结束日期')
    }
    await this.recurring.update(
      input.recurringId,
      {
        frequency: input.frequency,
        intervalValue: input.intervalValue,
        nextOccurrenceAt: input.nextOccurrenceAt,
        endDate: input.endDate,
        enabled: input.enabled,
      },
      undefined,
      this.clock.nowIso(),
    )
  }

  async deleteRecurring(ledgerId: string, recurringId: string): Promise<void> {
    const existing = await this.recurring.findById(recurringId)
    if (!existing || existing.ledgerId !== ledgerId) {
      throw new Error('周期交易不存在')
    }
    await this.recurring.delete(recurringId)
  }

  /** 给定当前频率与下次执行时间，计算下一次出现的时间点。 */
  computeNextOccurrence(
    frequency: RecurringFrequency,
    interval: number,
    fromIso: string,
    endDate?: string,
  ): string | undefined {
    const days = FREQUENCY_DAYS[frequency] * Math.max(1, interval)
    const base = new Date(fromIso)
    if (frequency === 'monthly') {
      // 月度：按日历加一个月
      const next = new Date(
        Date.UTC(
          base.getUTCFullYear(),
          base.getUTCMonth() + interval,
          base.getUTCDate(),
          base.getUTCHours(),
          base.getUTCMinutes(),
          base.getUTCSeconds(),
        ),
      )
      const nextIso = next.toISOString()
      if (endDate && nextIso > endDate) return undefined
      return nextIso
    }
    const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    const nextIso = next.toISOString()
    if (endDate && nextIso > endDate) return undefined
    return nextIso
  }
}

export function useRecurringService(): RecurringServicePort | undefined {
  return inject(recurringServiceKey, undefined)
}

function assertIsoDate(value: string, label: string): void {
  if (value.trim() === '' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label}格式不正确`)
  }
}
