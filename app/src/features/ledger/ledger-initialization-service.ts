import { getLogger } from '@/features/debug/app-logger'
import type { AccountRecord, CategoryRecord, LedgerRecord } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import { LedgerRepository } from '@/db/repositories/ledger-repository'

const log = getLogger('ledger-init')

const DEFAULT_CATEGORIES = [
  { kind: 'expense', name: '餐饮' },
  { kind: 'expense', name: '交通' },
  { kind: 'expense', name: '购物' },
  { kind: 'expense', name: '居住' },
  { kind: 'expense', name: '医疗' },
  { kind: 'expense', name: '娱乐' },
  { kind: 'expense', name: '人情往来' },
  { kind: 'expense', name: '其他支出' },
  { kind: 'income', name: '工资' },
  { kind: 'income', name: '奖金' },
  { kind: 'income', name: '红包' },
  { kind: 'income', name: '投资收益' },
  { kind: 'income', name: '其他收入' },
] as const

export interface LedgerInitializationResult {
  ledger: LedgerRecord
  created: boolean
}

export class LedgerInitializationService {
  constructor(
    private readonly ledgers: LedgerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async initialize(): Promise<LedgerInitializationResult> {
    log.debug('initialize: start')
    const existing = await this.ledgers.findFirst()
    if (existing) {
      log.info('initialize: using existing', { ledgerId: existing.id })
      return { ledger: existing, created: false }
    }

    const now = this.clock.nowIso()
    const ledger: LedgerRecord = {
      id: this.ids.next('ledger'),
      name: '日常账本',
      baseCurrency: 'CNY',
      periodStartDay: 1,
      createdAt: now,
      updatedAt: now,
    }
    const cashAccount: AccountRecord = {
      id: this.ids.next('account'),
      ledgerId: ledger.id,
      name: '现金',
      type: 'cash',
      normalBalance: 'debit',
      currency: 'CNY',
      createdAt: now,
      updatedAt: now,
    }
    const categories: CategoryRecord[] = DEFAULT_CATEGORIES.map((category, index) => ({
      id: this.ids.next('category'),
      ledgerId: ledger.id,
      kind: category.kind,
      name: category.name,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    }))

    await this.ledgers.createWithDefaults({ ledger, cashAccount, categories })
    log.info('initialize: created', { ledgerId: ledger.id, name: ledger.name })
    return { ledger, created: true }
  }
}
