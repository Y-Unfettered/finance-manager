import { inject, type InjectionKey } from 'vue'

import type { TransactionTemplateType, TransactionTemplateWithRefs } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import {
  TemplateRepository,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from '@/db/repositories/template-repository'

export type { CreateTemplateInput, UpdateTemplateInput }

export interface TemplateServicePort {
  listTemplates(ledgerId: string): Promise<readonly TransactionTemplateWithRefs[]>
  createTemplate(input: CreateTemplateInput): Promise<string>
  updateTemplate(input: UpdateTemplateInput): Promise<void>
  deleteTemplate(ledgerId: string, templateId: string): Promise<void>
  getTemplate(templateId: string): Promise<TransactionTemplateWithRefs | undefined>
}

export const templateServiceKey: InjectionKey<TemplateServicePort> = Symbol('templateService')

const VALID_TYPES: ReadonlySet<TransactionTemplateType> = new Set([
  'expense',
  'income',
  'transfer',
  'credit_purchase',
  'repay_borrowing',
  'loan_out',
  'loan_recovery',
])

export class TemplateService implements TemplateServicePort {
  private readonly templates: TemplateRepository

  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.templates = new TemplateRepository(database)
  }

  listTemplates(ledgerId: string): Promise<readonly TransactionTemplateWithRefs[]> {
    return this.templates.listByLedger(ledgerId)
  }

  async createTemplate(input: CreateTemplateInput): Promise<string> {
    if (!VALID_TYPES.has(input.transactionType)) {
      throw new Error(`不支持的模板类型：${input.transactionType}`)
    }
    const name = requiredText(input.name, '请输入模板名称')
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('模板金额必须为正数')
    }
    const now = this.clock.nowIso()
    const id = this.ids.next('template')
    await this.templates.create({
      id,
      ledgerId: input.ledgerId,
      name,
      transactionType: input.transactionType,
      amountMinor: input.amountMinor,
      categoryId: optionalText(input.categoryId),
      sourceAccountId: optionalText(input.sourceAccountId),
      targetAccountId: optionalText(input.targetAccountId),
      merchant: optionalText(input.merchant),
      note: optionalText(input.note),
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }

  async updateTemplate(input: UpdateTemplateInput): Promise<void> {
    const existing = await this.templates.findById(input.templateId)
    if (!existing || existing.ledgerId !== input.ledgerId) {
      throw new Error('模板不存在')
    }
    if (input.name !== undefined) {
      requiredText(input.name, '模板名称不能为空')
    }
    if (input.amountMinor !== undefined && input.amountMinor <= 0) {
      throw new Error('模板金额必须为正数')
    }
    await this.templates.update(
      input.templateId,
      {
        name: input.name,
        amountMinor: input.amountMinor,
        categoryId: input.categoryId,
        sourceAccountId: input.sourceAccountId,
        targetAccountId: input.targetAccountId,
        merchant: input.merchant,
        note: input.note,
        sortOrder: input.sortOrder,
      },
      this.clock.nowIso(),
    )
  }

  async deleteTemplate(ledgerId: string, templateId: string): Promise<void> {
    const existing = await this.templates.findById(templateId)
    if (!existing || existing.ledgerId !== ledgerId) {
      throw new Error('模板不存在')
    }
    await this.templates.delete(templateId)
  }

  getTemplate(templateId: string): Promise<TransactionTemplateWithRefs | undefined> {
    return this.templates.findWithRefsById(templateId)
  }
}

export function useTemplateService(): TemplateServicePort | undefined {
  return inject(templateServiceKey, undefined)
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
