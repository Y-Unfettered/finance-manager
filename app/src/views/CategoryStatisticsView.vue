<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import DistributionBars from '@/components/DistributionBars.vue'
import DistributionDonut from '@/components/DistributionDonut.vue'
import MoneyText from '@/components/MoneyText.vue'
import MonthlyBarChart from '@/components/MonthlyBarChart.vue'
import PeriodWheel, { type StatisticsRangePreset } from '@/components/PeriodWheel.vue'
import TransactionDetailSheet from '@/components/TransactionDetailSheet.vue'
import { useRefreshOnActivated } from '@/composables/useRefreshOnActivated'
import { useAppStore } from '@/stores/app'
import { useBudgetService } from '@/features/budget/budget-service'
import {
  statisticsRange,
  useStatisticsService,
  type CategoryStatistics,
} from '@/features/statistics/statistics-service'

const route = useRoute()
const router = useRouter()
const service = useStatisticsService()
const appStore = useAppStore()
const budgetService = useBudgetService()
const preset = ref<StatisticsRangePreset>('this_year')
const year = ref(new Date().getFullYear())
const customStart = ref('')
const customEnd = ref('')
const data = ref<CategoryStatistics>()
const loading = ref(true)
const error = ref('')
const showTx = ref(false)
const activeTx = ref<string>()
const selectedMonth = ref<string>()

/** 该分类本月预算对照（配置了分类预算才显示）。 */
const categoryBudget = ref<{
  limitMinor: number
  spentMinor: number
  overspent: boolean
} | null>(null)

async function loadCategoryBudget(categoryName: string): Promise<void> {
  categoryBudget.value = null
  if (!budgetService) return
  const ledgerId = appStore.ledgerId
  if (!ledgerId) return
  const now = new Date()
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  try {
    const progress = await budgetService.getBudgetForPeriod(ledgerId, periodKey)
    const match = progress?.categoryBudgets.find((c) => c.categoryName === categoryName)
    if (match) {
      categoryBudget.value = {
        limitMinor: match.limitMinor,
        spentMinor: match.spentMinor,
        overspent: match.overspent,
      }
    }
  } catch {
    // 预算读取失败不影响统计展示
  }
}

const range = computed(() =>
  statisticsRange(preset.value, {
    year: year.value,
    startDate: customStart.value,
    endDate: customEnd.value,
  }),
)
/** 有数据的最早年份（滚轮起点用，PRD 需求二 5.2） */
const minYear = computed(() => {
  const first = data.value?.monthly[0]?.periodKey
  return first ? Number(first.slice(0, 4)) : undefined
})
const displayedTransactions = computed(() =>
  selectedMonth.value
    ? (data.value?.transactions.filter((item) =>
        item.occurredAt.startsWith(selectedMonth.value!),
      ) ?? [])
    : (data.value?.transactions ?? []),
)
const dailyAverage = computed(() => {
  if (!data.value) return 0
  const days = Math.max(
    1,
    Math.ceil(
      (new Date(range.value.endUtc).getTime() - new Date(range.value.startUtc).getTime()) /
        86_400_000,
    ),
  )
  return Math.round((data.value.incomeMinor + data.value.expenseMinor) / days)
})

async function load(
  options: { preserveSelection?: boolean; silent?: boolean } = {},
): Promise<void> {
  if (!service) return
  if (!options.silent) loading.value = true
  error.value = ''
  if (!options.preserveSelection) selectedMonth.value = undefined
  try {
    data.value = await service.category(String(route.params.categoryId), range.value)
    if (data.value) void loadCategoryBudget(data.value.name)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (!options.silent) loading.value = false
  }
}

function open(id: string): void {
  activeTx.value = id
  showTx.value = true
}

watch([preset, year, customStart, customEnd], () => {
  if (preset.value !== 'custom' || (customStart.value && customEnd.value)) void load()
})
onMounted(load)
useRefreshOnActivated(() => load({ preserveSelection: true, silent: true }))
</script>

<template>
  <main class="stats-page">
    <div class="safe-top">
      <AppTopBar :title="`分类统计${data ? ` - ${data.name}` : ''}`" @back="router.back()" />
    </div>
    <div class="content">
      <PeriodWheel
        v-model:preset="preset"
        v-model:year="year"
        v-model:start-date="customStart"
        v-model:end-date="customEnd"
        :min-year="minYear"
      />
      <div v-if="loading" class="state">正在统计…</div>
      <div v-else-if="error" class="state error">{{ error }}</div>
      <template v-else-if="data">
        <BaseCard class="kpis">
          <div><span>总收入</span><MoneyText :amount-minor="data.incomeMinor" tone="income" /></div>
          <div>
            <span>总支出</span><MoneyText :amount-minor="data.expenseMinor" tone="expense" />
          </div>
          <div><span>结余</span><MoneyText :amount-minor="data.balanceMinor" /></div>
          <div>
            <span>交易笔数</span><strong>{{ data.transactionCount }}</strong>
          </div>
          <div><span>日均金额</span><MoneyText :amount-minor="dailyAverage" /></div>
          <div><span>笔均金额</span><MoneyText :amount-minor="data.averageMinor" /></div>
        </BaseCard>
        <BaseCard v-if="categoryBudget" class="budget-card">
          <h2>本月预算</h2>
          <div class="budget-track">
            <i
              class="budget-track__fill"
              :class="{ 'budget-track__fill--over': categoryBudget.overspent }"
              :style="{
                width: Math.min(
                  100,
                  Math.round(
                    (categoryBudget.spentMinor / Math.max(1, categoryBudget.limitMinor)) * 100,
                  ),
                ) + '%',
              }"
            />
          </div>
          <p class="budget-caption">
            已支出 {{ (categoryBudget.spentMinor / 100).toFixed(2) }} / 预算
            {{ (categoryBudget.limitMinor / 100).toFixed(2) }}
            <b :class="categoryBudget.overspent ? 'budget-caption--bad' : 'budget-caption--ok'">
              {{ categoryBudget.overspent ? '已超支' : '剩余 ' + ((categoryBudget.limitMinor - categoryBudget.spentMinor) / 100).toFixed(2) }}
            </b>
          </p>
        </BaseCard>
        <BaseCard>
          <h2>月度趋势</h2>
          <MonthlyBarChart :points="data.monthly" @select="selectedMonth = $event" />
          <p v-if="selectedMonth" class="chart-hint">
            已筛选 {{ selectedMonth }}，再次点击柱状图取消
          </p>
        </BaseCard>
        <!-- 无二级分类时构成只有自身一条，没有信息量，不显示 -->
        <BaseCard v-if="data.distribution.length > 1">
          <h2>分类构成</h2>
          <DistributionDonut :points="data.distribution" />
          <DistributionBars :items="data.distribution" />
        </BaseCard>
        <BaseCard class="tx-list">
          <h2>交易明细</h2>
          <button
            v-for="tx in displayedTransactions"
            :key="tx.id"
            type="button"
            @click="open(tx.id)"
          >
            <span>
              <strong>{{ tx.merchant ?? tx.categoryName ?? '交易' }}</strong>
              <small>{{ tx.occurredAt.slice(0, 10) }} · {{ tx.primaryAccountName }}</small>
            </span>
            <MoneyText
              :amount-minor="tx.amountMinor"
              :tone="tx.type === 'income' || tx.type === 'refund' ? 'income' : 'expense'"
            />
          </button>
          <p v-if="!displayedTransactions.length">暂无交易</p>
        </BaseCard>
      </template>
    </div>
    <TransactionDetailSheet
      :show="showTx"
      :transaction-id="activeTx"
      @update:show="showTx = $event"
      @updated="load"
    />
  </main>
</template>

<style scoped src="./statistics-shared.css"></style>
<style scoped>
.chart-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}

/* 本月预算对照 */
.budget-card h2 {
  margin: 0 0 var(--space-2);
  font-size: var(--type-section-title-size);
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
  margin: var(--space-2) 0 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.budget-caption--ok {
  color: var(--color-income);
}

.budget-caption--bad {
  color: var(--color-expense);
}
</style>
