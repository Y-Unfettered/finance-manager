import { inject, type InjectionKey } from 'vue'

import type {
  AccountActivityRecord,
  TransactionSearchResultItem,
} from '@/db/repositories/transaction-repository'
import { AccountRepository } from '@/db/repositories/account-repository'
import { CategoryRepository } from '@/db/repositories/category-repository'
import {
  StatisticsRepository,
  type AssetMonthlyDelta,
  type DistributionRow,
  type MonthlyFlowRow,
} from '@/db/repositories/statistics-repository'
import { TransactionRepository } from '@/db/repositories/transaction-repository'
import type { SqliteExecutor } from '@/db/core/types'
import type { AccountBalanceRecord } from '@/domain/entities'
import type { Clock } from '@/domain/time'
import type { IdGenerator } from '@/domain/identity'

export interface DateRange {
  startUtc: string
  endUtc: string
  label: string
}
export interface CategoryStatistics {
  name: string
  incomeMinor: number
  expenseMinor: number
  balanceMinor: number
  transactionCount: number
  averageMinor: number
  monthly: readonly MonthlyFlowRow[]
  distribution: readonly DistributionRow[]
  transactions: readonly TransactionSearchResultItem[]
}
export interface AccountStatistics {
  name: string
  inflowMinor: number
  outflowMinor: number
  netMinor: number
  transferRepaymentMinor: number
  transactionCount: number
  monthly: readonly { periodKey: string; inflowMinor: number; outflowMinor: number }[]
  distribution: readonly DistributionRow[]
  activities: readonly AccountActivityRecord[]
}
export interface AssetTrendPoint {
  periodKey: string
  assetsMinor: number
  liabilitiesMinor: number
  netAssetsMinor: number
  changeMinor: number
}

export class StatisticsService {
  private readonly stats: StatisticsRepository
  private readonly categories: CategoryRepository
  private readonly accounts: AccountRepository
  private readonly transactions: TransactionRepository
  constructor(
    database: SqliteExecutor,
    ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    this.stats = new StatisticsRepository(database)
    this.categories = new CategoryRepository(database)
    this.accounts = new AccountRepository(database)
    this.transactions = new TransactionRepository(database, ids, clock)
  }
  async category(categoryId: string, range: DateRange): Promise<CategoryStatistics> {
    const category = await this.categories.findById(categoryId)
    if (!category) throw new Error('分类不存在')
    const [totals, monthly, distribution, transactions] = await Promise.all([
      this.stats.categoryTotals(categoryId, range.startUtc, range.endUtc),
      this.stats.categoryMonthly(categoryId, range.startUtc, range.endUtc),
      this.stats.categoryDistribution(categoryId, range.startUtc, range.endUtc),
      this.transactions.search({
        ledgerId: category.ledgerId,
        categoryId,
        startUtc: range.startUtc,
        endUtc: range.endUtc,
      }),
    ])
    return {
      name: category.name,
      ...totals,
      balanceMinor: totals.incomeMinor - totals.expenseMinor,
      averageMinor: totals.transactionCount
        ? Math.round((totals.incomeMinor + totals.expenseMinor) / totals.transactionCount)
        : 0,
      monthly,
      distribution,
      transactions,
    }
  }
  async account(accountId: string, range: DateRange): Promise<AccountStatistics> {
    const account = await this.accounts.findBalance(accountId)
    if (!account) throw new Error('账户不存在')
    const activities = (await this.transactions.listByAccount(accountId)).filter(
      (row) => row.occurredAt >= range.startUtc && row.occurredAt < range.endUtc,
    )
    const transferTypes = new Set([
      'transfer',
      'repayment',
      'loan_out',
      'loan_recovery',
      'borrowing',
      'repay_borrowing',
    ])
    const liability = account.normalBalance === 'credit'
    let inflowMinor = 0,
      outflowMinor = 0,
      transferRepaymentMinor = 0
    const monthMap = new Map<
      string,
      { periodKey: string; inflowMinor: number; outflowMinor: number }
    >()
    for (const row of activities) {
      const key = row.occurredAt.slice(0, 7)
      const month = monthMap.get(key) ?? { periodKey: key, inflowMinor: 0, outflowMinor: 0 }
      if (transferTypes.has(row.type)) transferRepaymentMinor += row.amountMinor
      if (liability) {
        if (row.type === 'credit_purchase') {
          outflowMinor += row.amountMinor
          month.outflowMinor += row.amountMinor
        } else if (row.type === 'refund') {
          outflowMinor -= row.amountMinor
          month.outflowMinor -= row.amountMinor
        } else if (!transferTypes.has(row.type)) {
          if (row.changeMinor >= 0) {
            inflowMinor += row.changeMinor
            month.inflowMinor += row.changeMinor
          } else {
            outflowMinor += Math.abs(row.changeMinor)
            month.outflowMinor += Math.abs(row.changeMinor)
          }
        }
      } else if (row.changeMinor >= 0) {
        inflowMinor += row.changeMinor
        month.inflowMinor += row.changeMinor
      } else {
        outflowMinor += Math.abs(row.changeMinor)
        month.outflowMinor += Math.abs(row.changeMinor)
      }
      monthMap.set(key, month)
    }
    return {
      name: account.name,
      inflowMinor,
      outflowMinor,
      netMinor: inflowMinor - outflowMinor,
      transferRepaymentMinor,
      transactionCount: activities.length,
      monthly: [...monthMap.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey)),
      distribution: await this.stats.accountDistribution(accountId, range.startUtc, range.endUtc),
      activities,
    }
  }
  async assets(ledgerId: string, year: number): Promise<AssetTrendPoint[]> {
    return this.assetsRange(ledgerId, `${year}-01`, `${year}-12`)
  }
  async assetsRange(
    ledgerId: string,
    startPeriod?: string,
    endPeriod?: string,
  ): Promise<AssetTrendPoint[]> {
    const currentPeriod = this.clock.nowIso().slice(0, 7)
    const resolvedEnd = minPeriod(endPeriod ?? currentPeriod, currentPeriod)
    if (startPeriod && startPeriod > resolvedEnd) return []
    const [endYear, endMonth] = resolvedEnd.split('-').map(Number)
    const endUtc = new Date(Date.UTC(endYear!, endMonth!, 1)).toISOString()
    const deltas = await this.stats.assetMonthlyDeltas(ledgerId, endUtc)
    return buildAssetTrendPoints(deltas, startPeriod, resolvedEnd)
  }

  async assetStatement(ledgerId: string, periodKey: string): Promise<AccountBalanceRecord[]> {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey)
    if (!match) throw new Error(`月份必须使用 YYYY-MM 格式：${periodKey}`)
    const endUtc = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1)).toISOString()
    return this.accounts.listBalancesAt(ledgerId, endUtc)
  }
}

export function buildAssetTrendPoints(
  deltas: readonly AssetMonthlyDelta[],
  startPeriod: string | undefined,
  endPeriod: string,
): AssetTrendPoint[] {
  const firstDataPeriod = deltas[0]?.periodKey
  if (!firstDataPeriod) return []

  const resolvedStart = maxPeriod(startPeriod ?? firstDataPeriod, firstDataPeriod)
  if (resolvedStart > endPeriod) return []

  let assets = 0,
    liabilities = 0
  const byMonth = new Map(deltas.map((row) => [row.periodKey, row]))
  for (const row of deltas.filter((item) => item.periodKey < resolvedStart)) {
    assets += row.assetDeltaMinor
    liabilities += row.liabilityDeltaMinor
  }
  let previousNet = assets - liabilities
  const points: AssetTrendPoint[] = []
  const [startYear, startMonth] = resolvedStart.split('-').map(Number)
  const cursor = new Date(Date.UTC(startYear!, startMonth! - 1, 1))
  const [endYear, endMonth] = endPeriod.split('-').map(Number)
  const endCursor = new Date(Date.UTC(endYear!, endMonth! - 1, 1))
  while (cursor <= endCursor) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    const row = byMonth.get(key)
    assets += row?.assetDeltaMinor ?? 0
    liabilities += row?.liabilityDeltaMinor ?? 0
    const net = assets - liabilities
    points.push({
      periodKey: key,
      assetsMinor: assets,
      liabilitiesMinor: liabilities,
      netAssetsMinor: net,
      changeMinor: net - previousNet,
    })
    previousNet = net
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return points
}

function minPeriod(left: string, right: string): string {
  return left < right ? left : right
}

function maxPeriod(left: string, right: string): string {
  return left > right ? left : right
}

export function yearRange(year: number): DateRange {
  return {
    startUtc: new Date(Date.UTC(year, 0, 1)).toISOString(),
    endUtc: new Date(Date.UTC(year + 1, 0, 1)).toISOString(),
    label: `${year}年`,
  }
}
export function statisticsRange(
  preset: 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'year' | 'all' | 'custom',
  options: { year?: number; startDate?: string; endDate?: string; now?: Date } = {},
): DateRange {
  const now = options.now ?? new Date()
  if (preset === 'all')
    return {
      startUtc: new Date(Date.UTC(1970, 0, 1)).toISOString(),
      endUtc: new Date(Date.UTC(2201, 0, 1)).toISOString(),
      label: '全部',
    }
  if (preset === 'custom') {
    if (!options.startDate || !options.endDate)
      return {
        startUtc: now.toISOString(),
        endUtc: now.toISOString(),
        label: '请选择完整的起止日期',
      }
    const start = new Date(`${options.startDate}T00:00:00`)
    const end = new Date(`${options.endDate}T00:00:00`)
    end.setDate(end.getDate() + 1)
    if (start >= end) throw new Error('开始日期不能晚于结束日期')
    return {
      startUtc: start.toISOString(),
      endUtc: end.toISOString(),
      label: `${options.startDate} 至 ${options.endDate}`,
    }
  }
  if (preset === 'year') return yearRange(options.year ?? now.getFullYear())
  if (preset === 'this_year') return yearRange(now.getFullYear())
  if (preset === 'last_year') return yearRange(now.getFullYear() - 1)
  const offset = preset === 'last_month' ? -1 : 0
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    label: preset === 'last_month' ? '上月' : '本月',
  }
}
export const statisticsServiceKey: InjectionKey<StatisticsService> = Symbol('statisticsService')
export function useStatisticsService(): StatisticsService | undefined {
  return inject(statisticsServiceKey, undefined)
}
