import { inject, type InjectionKey } from 'vue'

import { getLogger } from '@/features/debug/app-logger'

const log = getLogger('ledger')

import { normalBalanceForAccountType } from '@/domain/accounts'
import type { AccountRecord, CategoryRecord, LedgerRecord } from '@/domain/entities'
import type { IdGenerator } from '@/domain/identity'
import type { Clock } from '@/domain/time'
import type { SqliteExecutor } from '@/db/core/types'
import { LedgerRepository, type LedgerSummary } from '@/db/repositories/ledger-repository'

const DEFAULT_CATEGORIES = [
  ['expense', '餐饮'],
  ['expense', '交通'],
  ['expense', '购物'],
  ['expense', '居住'],
  ['expense', '医疗'],
  ['expense', '娱乐'],
  ['expense', '其他支出'],
  ['income', '工资'],
  ['income', '奖金'],
  ['income', '投资收益'],
  ['income', '其他收入'],
] as const

export class LedgerService {
  private readonly ledgers: LedgerRepository

  constructor(
    database: SqliteExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.ledgers = new LedgerRepository(database)
  }

  list(): Promise<LedgerSummary[]> {
    return this.ledgers.list()
  }

  async create(name: string): Promise<LedgerRecord> {
    log.debug('create: start', { name })
    const trimmed = name.trim()
    if (!trimmed) throw new Error('请输入账本名称')
    const now = this.clock.nowIso()
    const ledger: LedgerRecord = {
      id: this.ids.next('ledger'),
      name: trimmed,
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
      normalBalance: normalBalanceForAccountType('cash'),
      currency: 'CNY',
      createdAt: now,
      updatedAt: now,
    }
    const categories: CategoryRecord[] = DEFAULT_CATEGORIES.map(([kind, categoryName], index) => ({
      id: this.ids.next('category'),
      ledgerId: ledger.id,
      kind,
      name: categoryName,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    }))
    await this.ledgers.createWithDefaults({ ledger, cashAccount, categories })
    log.info('create: success', { ledgerId: ledger.id, name: ledger.name })
    return ledger
  }

  async rename(id: string, name: string): Promise<void> {
    log.debug('rename: start', { ledgerId: id })
    const trimmed = name.trim()
    if (!trimmed) throw new Error('请输入账本名称')
    await this.ledgers.rename(id, trimmed, this.clock.nowIso())
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    log.debug('setArchived: start', { ledgerId: id, archived })
    const all = await this.ledgers.list()
    const target = all.find((item) => item.id === id)
    if (!target) throw new Error('账本不存在')
    if (archived && all.filter((item) => !item.archivedAt && item.id !== id).length === 0) {
      throw new Error('至少保留一个正在使用的账本')
    }
    const now = this.clock.nowIso()
    await this.ledgers.setArchived(id, archived ? now : undefined, now)
  }
}

export const ledgerServiceKey: InjectionKey<LedgerService> = Symbol('ledgerService')
export function useLedgerService(): LedgerService | undefined {
  return inject(ledgerServiceKey, undefined)
}
