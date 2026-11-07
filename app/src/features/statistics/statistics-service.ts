import { inject, type InjectionKey } from 'vue'

import type {
  AccountActivityRecord,
  TransactionSearchResultItem,
} from '@/db/repositories/transaction-repository'
import { normalizeCategoryColor } from '@/features/finance/category-color'
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
/** 归一化后的支出分布切片；"其他"归并项固定最后一位、UI 用中性灰渲染。 */
export interface DistributionSlice {
  id: string
  name: string
  amountMinor: number
  /** 分类色（槽名 cat-N），渲染端解析为当前主题 token */
  color?: string
  /** true = 由小项归并出的"其他" */
  isOther?: boolean
}

export interface CategoryStatistics {
  name: string
  incomeMinor: number
  expenseMinor: number
  balanceMinor: number
  transactionCount: number
  averageMinor: number
  monthly: readonly MonthlyFlowRow[]
  distribution: readonly DistributionSlice[]
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
  distribution: readonly DistributionSlice[]
  activities: readonly AccountActivityRecord[]
}
export interface AssetTrendPoint {
  periodKey: string
  assetsMinor: number
  liabilitiesMinor: number
  netAssetsMinor: number
  changeMinor: number
}

export const DISTRIBUTION_OTHER_ID = '__other__'
const DISTRIBUTION_TOP_N = 8
const DISTRIBUTION_OTHER_MIN_SHARE = 0.01

/**
 * 支出分布归一化（账户统计与分类统计共用口径，PRD BUG-04）：
 * 过滤 0/负值（退款冲抵、纯退款分类）→ 按金额倒序 → 占比 <1% 或超出前 8 的并入"其他"。
 * 环形图与条形图必须吃同一份输出，保证图例和条目一一对应。
 */
export function buildDistribution(
  rows: readonly DistributionRow[],
  options: { topN?: number } = {},
): DistributionSlice[] {
  const positive = rows
    .filter((row) => row.amountMinor > 0)
    .sort((left, right) => right.amountMinor - left.amountMinor)
  if (!positive.length) return []
  const total = positive.reduce((sum, row) => sum + row.amountMinor, 0)
  const kept = positive.filter(
    (row) => row.amountMinor / total >= DISTRIBUTION_OTHER_MIN_SHARE,
  )
  // 全部都 <1%（大量碎片分类）时至少保留最大一项，避免图表整体消失
  const merged = kept.length ? kept : positive.slice(0, 1)
  const top = merged.slice(0, options.topN ?? DISTRIBUTION_TOP_N)
  const restAmount = positive
    .filter((row) => !top.includes(row))
    .reduce((sum, row) => sum + row.amountMinor, 0)
  const slices: DistributionSlice[] = top.map((row) => ({ ...row }))
  if (restAmount > 0) {
    slices.push({
      id: DISTRIBUTION_OTHER_ID,
      name: '其他',
      amountMinor: restAmount,
      isOther: true,
    })
  }
  return slices
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
      distribution: await this.withDistributionColors(
        category.ledgerId,
        buildDistribution(distribution),
      ),
      transactions,
    }
  }

  /** 分类 id → 色槽（仅含有颜色偏好的分类），保证统计图与分类管理页同色（PRD 需求一 4.5）。 */
  private async categoryColorMap(ledgerId: string): Promise<Map<string, string>> {
    const details = await this.categories.listDetailsByLedger(ledgerId)
    return new Map(
      details
        .filter((detail) => detail.color)
        .map((detail) => [detail.id, normalizeCategoryColor(detail.color)]),
    )
  }

  private async withDistributionColors(
    ledgerId: string,
    slices: readonly DistributionSlice[],
  ): Promise<DistributionSlice[]> {
    const colorMap = await this.categoryColorMap(ledgerId)
    return slices.map((slice) => ({ ...slice, color: colorMap.get(slice.id) }))
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
      distribution: await this.withDistributionColors(
        account.ledgerId,
        buildDistribution(
          await this.stats.accountDistribution(accountId, range.startUtc, range.endUtc),
        ),
      ),
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
  if (firstDataPeriod > endPeriod) return []

  const resolvedStart = startPeriod ?? firstDataPeriod

  const byMonth = new Map(deltas.map((row) => [row.periodKey, row]))
  let assets = 0,
    liabilities = 0
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
    if (row) {
      assets += row.assetDeltaMinor
      liabilities += row.liabilityDeltaMinor
    }
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

export function yearRange(year: number): DateRange {
  // 与月度口径保持一致：本地时区年界（原来用 Date.UTC，UTC+8 下元旦 0-8 点
  // 的交易在年度视图归上一年、月度视图归新一年，两边对不上）
  return {
    startUtc: new Date(year, 0, 1).toISOString(),
    endUtc: new Date(year + 1, 0, 1).toISOString(),
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
    // 日期值可能来自未归一化的输入（如带时间串），非法时给中文提示而不是英文 RangeError
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      throw new Error('日期格式不正确，请重新选择')
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
