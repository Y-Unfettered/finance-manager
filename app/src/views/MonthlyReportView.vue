<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import DistributionBars from '@/components/DistributionBars.vue'
import DistributionDonut from '@/components/DistributionDonut.vue'
import MoneyText from '@/components/MoneyText.vue'
import MonthPickerSheet from '@/components/MonthPickerSheet.vue'
import { ChevronRight } from '@lucide/vue'
import { useUiPreference } from '@/composables/useUiPreference'
import { useBudgetService } from '@/features/budget/budget-service'
import {
  useFinanceService,
  type ExpenseCategoryOption,
  type HomeSnapshot,
  type IncomeCategoryOption,
} from '@/features/finance/finance-service'
import { useStatisticsService } from '@/features/statistics/statistics-service'
import type { AssetTrendPoint } from '@/features/statistics/statistics-service'
import { useAppStore } from '@/stores/app'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

type ReportMode = 'month' | 'year'
interface FlowPoint {
  label: string
  incomeMinor: number
  expenseMinor: number
}

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const finance = useFinanceService()
const budgetService = useBudgetService()
const statisticsService = useStatisticsService()
const queryMonth = typeof route.query.month === 'string' ? route.query.month : ''
const period = ref(
  /^\d{4}-(0[1-9]|1[0-2])$/.test(queryMonth) ? queryMonth : store.selectedHomePeriod,
)
const mode = useUiPreference<ReportMode>('monthly-report:mode', 'month', ['month', 'year'])
const loading = ref(true)
const showMonthPicker = ref(false)
const points = ref<FlowPoint[]>([])
const incomeMinor = ref(0)
const expenseMinor = ref(0)

const year = computed(() => Number(period.value.slice(0, 4)))
const month = computed(() => Number(period.value.slice(5, 7)))
const title = computed(() =>
  mode.value === 'month' ? `${year.value}年${month.value}月月报` : `${year.value}年报`,
)
const balanceMinor = computed(() => incomeMinor.value - expenseMinor.value)
const balanceRate = computed(() =>
  incomeMinor.value > 0 ? Math.round((balanceMinor.value / incomeMinor.value) * 1000) / 10 : 0,
)

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

// ============ 报告聚合状态 ============
const prevSummary = ref<{ incomeMinor: number; expenseMinor: number } | null>(null)
const budgetProgress = ref<Awaited<ReturnType<typeof loadBudget>> | null>(null)
const assetPoints = ref<AssetTrendPoint[]>([])
const monthTransactions = ref<HomeSnapshot['transactions']>([])
const yearTransactions = ref<HomeSnapshot['transactions']>([])
const allCategories = ref<(ExpenseCategoryOption | IncomeCategoryOption)[]>([])
const savingRate = computed(() =>
  incomeMinor.value > 0 ? Math.round((balanceMinor.value / incomeMinor.value) * 100) : 0,
)

function deltaLabel(current: number, prev: number | undefined): string {
  if (prev === undefined || prev === 0) return '—'
  const diff = current - prev
  if (diff === 0) return '持平'
  const pct = Math.round((Math.abs(diff) / prev) * 100)
  return `${diff > 0 ? '+' : '−'}${pct}%`
}

interface CategoryAgg {
  id: string | null
  name: string
  amountMinor: number
  count: number
}

/** 交易按一级分类聚合（categoryLabel→分类对照父级；退款负向冲减）。 */
function aggregateByCategory(
  transactions: HomeSnapshot['transactions'],
  categories: (ExpenseCategoryOption | IncomeCategoryOption)[],
): CategoryAgg[] {
  const byName = new Map(categories.map((c) => [c.name, c]))
  const parentNameOf = (name: string): string => {
    const self = byName.get(name)
    if (!self) return name
    if (!self.parentId) return self.name
    return byName.get(self.parentId)?.name ?? self.name
  }
  const map = new Map<string, CategoryAgg>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' && tx.type !== 'credit_purchase' && tx.type !== 'refund') continue
    let amount = tx.amountMinor
    if (tx.type === 'refund') amount = -amount
    const parent = parentNameOf(tx.categoryLabel ?? '')
    const id = byName.get(tx.categoryLabel ?? '')?.id ?? byName.get(parent)?.id ?? null
    const existing = map.get(parent)
    if (existing) {
      existing.amountMinor += amount
      existing.count += 1
    } else {
      map.set(parent, { id, name: parent, amountMinor: amount, count: 1 })
    }
  }
  return [...map.values()].filter((agg) => agg.amountMinor > 0).sort((a, b) => b.amountMinor - a.amountMinor)
}

const monthCategoryBreakdown = computed(() =>
  aggregateByCategory(monthTransactions.value, allCategories.value),
)
const yearCategoryBreakdown = computed(() =>
  aggregateByCategory(yearTransactions.value, allCategories.value),
)

const monthTopMerchants = computed(() => {
  const map = new Map<string, number>()
  for (const tx of monthTransactions.value) {
    if (tx.type !== 'expense' && tx.type !== 'credit_purchase') continue
    const key = tx.title ?? tx.categoryLabel ?? '其他'
    map.set(key, (map.get(key) ?? 0) + tx.amountMinor)
  }
  return [...map.entries()]
    .map(([name, amountMinor]) => ({ name, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, 3)
})

const monthMaxExpense = computed(() => {
  let max: { amountMinor: number; title: string; merchant: string; occurredAt: string } | null = null
  for (const tx of monthTransactions.value) {
    if (tx.type !== 'expense' && tx.type !== 'credit_purchase') continue
    if (!max || tx.amountMinor > max.amountMinor) {
      max = {
        amountMinor: tx.amountMinor,
        title: tx.categoryLabel ?? tx.title,
        merchant: tx.title,
        occurredAt: tx.occurredAt,
      }
    }
  }
  return max
})

const monthMovers = computed(() => {
  if (!prevSummary.value) return []
  const prevByCat = new Map(
    aggregateByCategory(prevMonthTransactions.value, allCategories.value).map((agg) => [agg.name, agg.amountMinor]),
  )
  return monthCategoryBreakdown.value
    .map((agg) => {
      const prev = prevByCat.get(agg.name) ?? 0
      return { name: agg.name, diff: agg.amountMinor - prev }
    })
    .filter((item) => item.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 3)
})

const prevMonthTransactions = ref<HomeSnapshot['transactions']>([])

const monthAssetChange = computed(() => {
  const key = period.value
  const point = assetPoints.value.find((p) => p.periodKey === key)
  return point ?? null
})

const yearAssetStart = computed(() =>
  assetPoints.value.length ? (assetPoints.value[0]?.netAssetsMinor ?? 0) : 0,
)
const yearAssetEnd = computed(() =>
  assetPoints.value.length
    ? (assetPoints.value[assetPoints.value.length - 1]?.netAssetsMinor ?? 0)
    : 0,
)

const yearMaxExpense = computed(() => {
  let max: { amountMinor: number; title: string; occurredAt: string } | null = null
  for (const tx of yearTransactions.value) {
    if (tx.type !== 'expense' && tx.type !== 'credit_purchase') continue
    if (!max || tx.amountMinor > max.amountMinor) {
      max = { amountMinor: tx.amountMinor, title: tx.categoryLabel ?? tx.title, occurredAt: tx.occurredAt }
    }
  }
  return max
})

const yearTopMonth = computed(() =>
  [...points.value].sort((a, b) => b.expenseMinor - a.expenseMinor)[0] ?? null,
)

const budgetPercent = computed(() => {
  if (!budgetProgress.value) return 0
  const total = budgetProgress.value.spentMinor + budgetProgress.value.remainingMinor
  if (total <= 0) return 0
  return Math.min(100, Math.round((budgetProgress.value.spentMinor / total) * 100))
})

const overspentCategories = computed(() =>
  (budgetProgress.value?.categories ?? []).filter((c) => c.overspent),
)

function structureBarWidth(amountMinor: number): string {
  const max =
    mode.value === 'month'
      ? (monthCategoryBreakdown.value[0]?.amountMinor ?? 0)
      : (yearCategoryBreakdown.value[0]?.amountMinor ?? 0)
  if (max <= 0) return '0%'
  return Math.max(4, Math.round((amountMinor / max) * 100)) + '%'
}

function jumpToCategory(agg: CategoryAgg): void {
  if (!agg.id) return
  router.push(`/categories/${agg.id}/statistics`)
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildChartOption() {
  const incomeColor = getCssVar('--color-income') || '#248561'
  const expenseColor = getCssVar('--color-expense') || '#d45f5a'
  const textColor = getCssVar('--color-text-tertiary') || '#999'
  const xData = points.value.map((p) => p.label)
  const incomeData = points.value.map((p) => Number((p.incomeMinor / 100).toFixed(2)))
  const expenseData = points.value.map((p) => Number((p.expenseMinor / 100).toFixed(2)))

  return {
    grid: { left: 0, right: 0, top: 8, bottom: 20, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const arr = (Array.isArray(params) ? params : []) as { seriesName: string; value: number; axisValue: string }[]
        if (!arr.length) return ''
        const first = arr[0]
        if (!first) return ''
        const lines = arr.map((p) => `${p.seriesName}：¥${p.value.toFixed(2)}`)
        return `${first.axisValue}<br/>${lines.join('<br/>')}`
      },
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: textColor, fontSize: 9, interval: 0 },
    },
    yAxis: { show: false, type: 'value' },
    series: [
      {
        name: '收入',
        type: 'bar',
        data: incomeData,
        itemStyle: { color: incomeColor, borderRadius: [5, 5, 1, 1] },
        barMaxWidth: 5,
        barGap: '40%',
      },
      {
        name: '支出',
        type: 'bar',
        data: expenseData,
        itemStyle: { color: expenseColor, borderRadius: [5, 5, 1, 1] },
        barMaxWidth: 5,
      },
    ],
  }
}

function renderChart(): void {
  if (!chartRef.value) return
  // KeepAlive/条件渲染可能重建 DOM：实例若已不挂在当前容器上则重建
  if (!chart || chart.getDom() !== chartRef.value) {
    chart?.dispose()
    chart = echarts.init(chartRef.value)
  }
  chart.setOption(buildChartOption(), true)
}

function handleResize(): void {
  chart?.resize()
}

onMounted(() => {
  nextTick(renderChart)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})

async function loadBudget(): Promise<{
  spentMinor: number
  remainingMinor: number
  overspent: boolean
  categories: readonly { categoryName: string; spentMinor: number; overspent: boolean }[]
} | null> {
  if (!budgetService || !store.ledgerId) return null
  const progress = await budgetService.getBudgetForPeriod(store.ledgerId, period.value)
  if (!progress) return null
  return {
    spentMinor: progress.spentMinor,
    remainingMinor: progress.remainingMinor,
    overspent: progress.overspent,
    categories: progress.categoryBudgets ?? [],
  }
}

async function load(): Promise<void> {
  if (!finance || !store.ledgerId) return
  loading.value = true
  store.selectHomePeriod(period.value)
  try {
    allCategories.value = finance
      ? ((await Promise.all([
          finance.listExpenseCategories(store.ledgerId),
          finance.listIncomeCategories(store.ledgerId),
        ])) as [ExpenseCategoryOption[], IncomeCategoryOption[]])
          .flat()
      : []
    const assetsPromise = statisticsService
      ? statisticsService.assets(store.ledgerId, year.value)
      : Promise.resolve<AssetTrendPoint[]>([])

    if (mode.value === 'year') {
      const snapshots = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          finance.loadHome(store.ledgerId!, new Date(year.value, index, 1)),
        ),
      )
      points.value = snapshots.map((snapshot, index) => ({
        label: `${index + 1}月`,
        incomeMinor: snapshot.summary.incomeMinor,
        expenseMinor: snapshot.summary.expenseMinor,
      }))
      setTotals(snapshots)
      yearTransactions.value = snapshots.flatMap((snapshot) => [...snapshot.transactions])
      monthTransactions.value = []
      prevSummary.value = null
    } else {
      const prev =
        month.value === 1
          ? finance.loadHome(store.ledgerId, new Date(year.value - 1, 11, 1))
          : finance.loadHome(store.ledgerId, new Date(year.value, month.value - 2, 1))
      const [snapshot, prevSnapshot] = await Promise.all([
        finance.loadHome(store.ledgerId, new Date(year.value, month.value - 1, 1)),
        prev.catch(() => null),
      ])
      incomeMinor.value = snapshot.summary.incomeMinor
      expenseMinor.value = snapshot.summary.expenseMinor
      prevSummary.value = prevSnapshot ? { ...prevSnapshot.summary } : null
      monthTransactions.value = snapshot.transactions
      yearTransactions.value = []
      const days = new Date(year.value, month.value, 0).getDate()
      const map = new Map<number, FlowPoint>()
      for (let day = 1; day <= days; day += 1) {
        map.set(day, { label: String(day), incomeMinor: 0, expenseMinor: 0 })
      }
      for (const item of snapshot.transactions) {
        const day = new Date(item.occurredAt).getDate()
        const point = map.get(day)!
        if (item.type === 'income') point.incomeMinor += item.amountMinor
        if (item.type === 'expense' || item.type === 'credit_purchase')
          point.expenseMinor += item.amountMinor
        if (item.type === 'refund') point.expenseMinor -= item.amountMinor
      }
      points.value = [...map.values()]
    }

    const [budget, assets] = await Promise.all([loadBudget(), assetsPromise])
    budgetProgress.value = budget
    assetPoints.value = assets
  } finally {
    loading.value = false
  }
}

function setTotals(snapshots: readonly HomeSnapshot[]): void {
  incomeMinor.value = snapshots.reduce((sum, item) => sum + item.summary.incomeMinor, 0)
  expenseMinor.value = snapshots.reduce((sum, item) => sum + item.summary.expenseMinor, 0)
}

function changeYear(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isInteger(value) && value >= 1970 && value <= 2200) period.value = `${value}-01`
}

function pickMonth(next: string): void {
  period.value = next
}

watch([period, mode], load)
watch(points, () => nextTick(renderChart), { deep: true })
onMounted(load)
</script>

<template>
  <main class="report-page">
    <section class="report-hero">
      <div class="report-hero__shade" />
      <div class="report-topbar">
        <AppTopBar :title="title" variant="transparent" @back="router.back()" />
      </div>
      <div class="report-summary">
        <span>{{ mode === 'month' ? '本月结余' : '本年结余' }}</span>
        <MoneyText :amount-minor="balanceMinor" />
        <div>
          <span
            >收入 <b>¥{{ (incomeMinor / 100).toFixed(2) }}</b></span
          >
          <span
            >支出 <b>¥{{ (expenseMinor / 100).toFixed(2) }}</b></span
          >
          <span
            >结余率 <b>{{ balanceRate }}%</b></span
          >
        </div>
      </div>
    </section>

    <div class="report-content">
      <div class="report-controls">
        <div class="report-tabs">
          <button type="button" :class="{ active: mode === 'month' }" @click="mode = 'month'">
            月
          </button>
          <button type="button" :class="{ active: mode === 'year' }" @click="mode = 'year'">
            年
          </button>
        </div>
        <button
          v-if="mode === 'month'"
          type="button"
          class="report-period"
          aria-label="选择月份"
          @click="showMonthPicker = true"
        >
          {{ period.replace('-', '.') }} <span aria-hidden="true">▾</span>
        </button>
        <input
          v-else
          :value="year"
          type="text"
          inputmode="numeric"
          aria-label="选择年份"
          class="report-period"
          @change="changeYear"
        />
      </div>

      <BaseCard class="report-trend">
        <header>
          <strong>收支趋势</strong>
          <span><i class="income" />收入 <i class="expense" />支出</span>
        </header>
        <!-- 图表 DOM 常驻（v-if 卸载会导致 ECharts 实例与重建后的 DOM 错位、画布空白） -->
        <div ref="chartRef" class="report-chart" :class="{ 'report-chart--loading': loading }" />
        <div v-if="loading" class="report-state report-state--overlay">正在生成报表…</div>
      </BaseCard>

      <BaseCard class="report-kpis">
        <div>
          <span>收入</span>
          <MoneyText :amount-minor="incomeMinor" tone="income" />
          <small v-if="mode === 'month'" class="kpi-delta">{{ deltaLabel(incomeMinor, prevSummary?.incomeMinor) }}</small>
        </div>
        <div>
          <span>支出</span>
          <MoneyText :amount-minor="expenseMinor" tone="expense" />
          <small v-if="mode === 'month'" class="kpi-delta">{{ deltaLabel(expenseMinor, prevSummary?.expenseMinor) }}</small>
        </div>
        <div>
          <span>结余</span>
          <MoneyText :amount-minor="balanceMinor" />
          <small v-if="mode === 'month'" class="kpi-delta">{{ deltaLabel(balanceMinor, prevSummary ? prevSummary.incomeMinor - prevSummary.expenseMinor : undefined) }}</small>
        </div>
      </BaseCard>

      <!-- ============ 月报板块 ============ -->
      <template v-if="mode === 'month'">
        <BaseCard v-if="monthCategoryBreakdown.length" class="report-section">
          <header class="report-section__head">
            <strong>支出结构</strong>
            <span>按一级分类 · 点击查看分类统计</span>
          </header>
          <DistributionDonut
            v-if="monthCategoryBreakdown.length > 1"
            :points="monthCategoryBreakdown.map((agg) => ({ id: agg.id ?? agg.name, name: agg.name, amountMinor: agg.amountMinor }))"
          />
          <div class="structure-list">
            <button
              v-for="agg in monthCategoryBreakdown"
              :key="agg.name"
              type="button"
              class="structure-row"
              @click="jumpToCategory(agg)"
            >
              <span class="structure-row__name">{{ agg.name }}</span>
              <span class="structure-row__bar">
                <i
                  :style="{
                    width: structureBarWidth(agg.amountMinor),
                    background: getCssVar('--color-expense') || '#d45f5a',
                  }"
                />
              </span>
              <span class="structure-row__amount">{{ (agg.amountMinor / 100).toFixed(2) }}</span>
              <ChevronRight :size="14" />
            </button>
          </div>
        </BaseCard>

        <BaseCard v-if="budgetProgress" class="report-section">
          <header class="report-section__head">
            <strong>预算执行</strong>
            <span :class="budgetProgress.overspent ? 'hl-bad' : 'hl-good'">
              {{ budgetProgress.overspent ? '已超支' : '剩余 ' + (budgetProgress.remainingMinor / 100).toFixed(2) }}
            </span>
          </header>
          <div class="budget-track">
            <i
              class="budget-track__fill"
              :class="{ 'budget-track__fill--over': budgetProgress.overspent }"
              :style="{ width: budgetPercent + '%' }"
            />
          </div>
          <p class="budget-caption">
            已支出 {{ (budgetProgress.spentMinor / 100).toFixed(2) }} / 预算
            {{ ((budgetProgress.spentMinor + budgetProgress.remainingMinor) / 100).toFixed(2) }}
          </p>
          <div v-if="overspentCategories.length" class="budget-overspent">
            <span class="tpl-kw-label">超支的分类</span>
            <div class="tpl-kw-words">
              <span v-for="c in overspentCategories" :key="c.categoryName" class="tpl-kw tpl-kw--bad">
                {{ c.categoryName }} 超 {{ (c.spentMinor / 100).toFixed(2) }}
              </span>
            </div>
          </div>
        </BaseCard>

        <BaseCard class="report-section">
          <header class="report-section__head">
            <strong>重点关注</strong>
          </header>
          <div class="hl-list">
            <div v-if="monthMaxExpense" class="hl-row">
              <span class="hl-row__k">最大单笔</span>
              <span class="hl-row__v">
                {{ monthMaxExpense.title }}{{ monthMaxExpense.merchant ? ' · ' + monthMaxExpense.merchant : '' }}
                <b>{{ (monthMaxExpense.amountMinor / 100).toFixed(2) }}</b>
              </span>
            </div>
            <div v-if="monthTopMerchants.length" class="hl-row">
              <span class="hl-row__k">消费 Top3</span>
              <span class="hl-row__v">
                {{ monthTopMerchants.map((m) => m.name).join('、') }}
              </span>
            </div>
            <div v-if="monthMovers.length" class="hl-row">
              <span class="hl-row__k">较上月多花</span>
              <span class="hl-row__v">
                {{ monthMovers.map((m) => `${m.name} +${(m.diff / 100).toFixed(2)}`).join('、') }}
              </span>
            </div>
            <div v-if="!monthMaxExpense && !monthTopMerchants.length" class="hl-row">
              <span class="hl-row__v">本月暂无支出</span>
            </div>
          </div>
        </BaseCard>

        <BaseCard class="report-section">
          <header class="report-section__head">
            <strong>资产变化</strong>
            <button type="button" class="report-link" @click="router.push('/assets/statistics')">
              资产统计
            </button>
          </header>
          <div v-if="monthAssetChange" class="hl-list">
            <div class="hl-row">
              <span class="hl-row__k">本月资产变动</span>
              <span class="hl-row__v">
                <b :class="monthAssetChange.changeMinor >= 0 ? 'hl-good' : 'hl-bad'">
                  {{ monthAssetChange.changeMinor >= 0 ? '+' : ''
                  }}{{ (monthAssetChange.changeMinor / 100).toFixed(2) }}
                </b>
              </span>
            </div>
            <div class="hl-row">
              <span class="hl-row__k">期末净资产</span>
              <span class="hl-row__v">
                {{ (monthAssetChange.netAssetsMinor / 100).toFixed(2) }}
              </span>
            </div>
          </div>
          <p v-else class="budget-caption">本月暂无资产变动记录</p>
        </BaseCard>
      </template>

      <!-- ============ 年报板块 ============ -->
      <template v-else>
        <BaseCard v-if="yearCategoryBreakdown.length" class="report-section">
          <header class="report-section__head">
            <strong>年度分类排行</strong>
            <span>按一级分类 · 点击查看分类统计</span>
          </header>
          <div class="structure-list">
            <button
              v-for="agg in yearCategoryBreakdown"
              :key="agg.name"
              type="button"
              class="structure-row"
              @click="jumpToCategory(agg)"
            >
              <span class="structure-row__name">{{ agg.name }}</span>
              <span class="structure-row__bar">
                <i
                  :style="{
                    width: structureBarWidth(agg.amountMinor),
                    background: getCssVar('--color-expense') || '#d45f5a',
                  }"
                />
              </span>
              <span class="structure-row__amount">{{ (agg.amountMinor / 100).toFixed(2) }}</span>
              <ChevronRight :size="14" />
            </button>
          </div>
        </BaseCard>

        <BaseCard class="report-section">
          <header class="report-section__head">
            <strong>年度之最</strong>
          </header>
          <div class="hl-list">
            <div v-if="yearMaxExpense" class="hl-row">
              <span class="hl-row__k">最大单笔</span>
              <span class="hl-row__v">
                {{ yearMaxExpense.title }}
                <b>{{ (yearMaxExpense.amountMinor / 100).toFixed(2) }}</b>
              </span>
            </div>
            <div v-if="yearTopMonth" class="hl-row">
              <span class="hl-row__k">支出最高月</span>
              <span class="hl-row__v">
                {{ yearTopMonth.label }}
                <b>{{ (yearTopMonth.expenseMinor / 100).toFixed(2) }}</b>
              </span>
            </div>
            <div class="hl-row">
              <span class="hl-row__k">储蓄率</span>
              <span class="hl-row__v">{{ savingRate }}%</span>
            </div>
          </div>
        </BaseCard>

        <BaseCard class="report-section">
          <header class="report-section__head">
            <strong>资产年报</strong>
            <button type="button" class="report-link" @click="router.push('/assets/statistics')">
              资产统计
            </button>
          </header>
          <div v-if="assetPoints.length" class="hl-list">
            <div class="hl-row">
              <span class="hl-row__k">年初净资产</span>
              <span class="hl-row__v">{{ (yearAssetStart / 100).toFixed(2) }}</span>
            </div>
            <div class="hl-row">
              <span class="hl-row__k">年末净资产</span>
              <span class="hl-row__v">{{ (yearAssetEnd / 100).toFixed(2) }}</span>
            </div>
            <div class="hl-row">
              <span class="hl-row__k">全年变动</span>
              <span class="hl-row__v">
                <b :class="yearAssetEnd - yearAssetStart >= 0 ? 'hl-good' : 'hl-bad'">
                  {{ yearAssetEnd - yearAssetStart >= 0 ? '+' : ''
                  }}{{
                    (
                      (yearAssetEnd - yearAssetStart) / 100
                    ).toFixed(2)
                  }}
                </b>
              </span>
            </div>
          </div>
          <p v-else class="budget-caption">本年暂无资产变动记录</p>
        </BaseCard>
      </template>
    </div>
    <MonthPickerSheet
      v-model:show="showMonthPicker"
      :period="period"
      title="选择月份"
      @select="pickMonth"
    />
  </main>
</template>

<style scoped>
.report-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.report-hero {
  position: relative;
  height: 278px;
  overflow: hidden;
  color: white;
  background: url('@/assets/home-hero-v1.png') center 42% / cover;
}
.report-hero__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgb(8 24 21 / 25%), rgb(6 20 18 / 78%));
}
.report-topbar {
  position: fixed;
  z-index: 40;
  top: 0;
  right: 0;
  left: 0;
  padding-top: env(safe-area-inset-top);
  background: linear-gradient(180deg, rgb(7 20 18 / 48%), transparent);
}
.report-summary {
  position: absolute;
  right: var(--page-gutter);
  bottom: 24px;
  left: var(--page-gutter);
  display: grid;
  gap: 4px;
}
.report-summary > span {
  font-size: 15px;
  font-weight: 600;
}
.report-summary :deep(.money-text) {
  color: white;
  font-size: 36px;
  font-weight: 650;
  line-height: 44px;
}
.report-summary > div {
  display: flex;
  margin-top: 10px;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}
.report-summary b {
  font-size: 13px;
}
.report-content {
  display: grid;
  max-width: 520px;
  padding: 14px var(--page-gutter) calc(32px + env(safe-area-inset-bottom));
  margin: auto;
  gap: 14px;
}
.report-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.report-tabs {
  display: grid;
  width: 128px;
  padding: 3px;
  grid-template-columns: 1fr 1fr;
  background: var(--color-surface);
  border-radius: 999px;
}
.report-tabs button {
  height: 34px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: 999px;
}
.report-tabs button.active {
  color: white;
  font-weight: 600;
  background: var(--color-primary-600);
}
.report-controls input,
.report-controls .report-period {
  width: 146px;
  height: 40px;
  padding: 0 12px;
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: 12px;
}
.report-controls .report-period {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.report-trend {
  position: relative;
  display: grid;
  gap: 16px;
  overflow: hidden;
}
.report-trend header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.report-trend header strong {
  font-size: 17px;
}
.report-trend header span {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--color-text-tertiary);
  font-size: 11px;
}
.report-trend header i {
  width: 12px;
  height: 3px;
  border-radius: 3px;
}
.report-trend header .income {
  margin-left: 8px;
  background: var(--color-income);
}
.report-trend header .expense {
  margin-left: 8px;
  background: var(--color-expense);
}
.report-chart {
  width: 100%;
  height: 158px;
}

.report-chart--loading {
  opacity: 0.25;
}

.report-state--overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
.report-state {
  min-height: 158px;
  display: grid;
  place-items: center;
  color: var(--color-text-tertiary);
}
.report-kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.report-kpis div {
  display: grid;
  gap: 3px;
}
.report-kpis span {
  color: var(--color-text-tertiary);
  font-size: 12px;
}
.report-kpis :deep(.money-text) {
  font-size: 14px;
  font-weight: 650;
}

/* ============ 报告板块 ============ */
.report-section {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.report-section__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.report-section__head strong {
  font-size: var(--type-section-title-size);
}

.report-section__head > span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.report-link {
  padding: 0;
  color: var(--color-primary-600);
  font-size: var(--type-caption-size);
  text-decoration: underline;
  background: transparent;
  border: 0;
}

.kpi-delta {
  display: block;
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 1.3;
}

.structure-list {
  display: grid;
  gap: var(--space-2);
}

.structure-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 72px 16px;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  color: inherit;
  font-size: var(--type-caption-size);
  text-align: left;
  background: transparent;
  border: 0;
}

.structure-row__name {
  overflow: hidden;
  color: var(--color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.structure-row__bar {
  height: 8px;
  overflow: hidden;
  background: var(--color-background);
  border-radius: 999px;
}

.structure-row__bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
}

.structure-row__amount {
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.structure-row > svg {
  color: var(--color-text-tertiary);
}

.budget-track {
  height: 10px;
  overflow: hidden;
  background: var(--color-background);
  border-radius: 999px;
}

.budget-track__fill {
  display: block;
  height: 100%;
  background: var(--color-primary-500);
  border-radius: 999px;
}

.budget-track__fill--over {
  background: var(--color-expense);
}

.budget-caption {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.budget-overspent {
  display: grid;
  gap: var(--space-1);
}

.tpl-kw-label {
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.tpl-kw-words {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tpl-kw {
  padding: 2px 8px;
  color: var(--color-text-secondary);
  font-size: 11px;
  background: var(--color-background);
  border-radius: 4px;
}

.tpl-kw--bad {
  color: var(--color-expense);
  background: color-mix(in srgb, var(--color-expense) 10%, transparent);
}

.hl-list {
  display: grid;
  gap: var(--space-2);
}

.hl-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: var(--space-2);
  align-items: baseline;
}

.hl-row__k {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.hl-row__v {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  line-height: 1.4;
}

.hl-row__v b {
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.hl-good {
  color: var(--color-income);
}

.hl-bad {
  color: var(--color-expense);
}
</style>
