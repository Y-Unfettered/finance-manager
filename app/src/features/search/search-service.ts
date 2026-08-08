import { inject, type InjectionKey } from 'vue'

import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'
import type { SqliteExecutor } from '@/db/core/types'
import {
  TransactionRepository,
  type TransactionSearchFilter,
  type TransactionSearchResultItem,
} from '@/db/repositories/transaction-repository'

export type { TransactionSearchFilter, TransactionSearchResultItem }

export interface SearchServicePort {
  searchTransactions(
    filter: TransactionSearchFilter,
  ): Promise<readonly TransactionSearchResultItem[]>
}

export const searchServiceKey: InjectionKey<SearchServicePort> = Symbol('searchService')

export class SearchService implements SearchServicePort {
  private readonly transactions: TransactionRepository

  constructor(database: SqliteExecutor, _ids: IdGenerator, _clock: Clock) {
    this.transactions = new TransactionRepository(database, _ids, _clock)
  }

  searchTransactions(
    filter: TransactionSearchFilter,
  ): Promise<readonly TransactionSearchResultItem[]> {
    return this.transactions.search(filter)
  }
}

export function useSearchService(): SearchServicePort | undefined {
  return inject(searchServiceKey, undefined)
}
