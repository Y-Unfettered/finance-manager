<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import DistributionDonut from '@/components/DistributionDonut.vue'
import MoneyText from '@/components/MoneyText.vue'
import MonthlyBarChart from '@/components/MonthlyBarChart.vue'
import StatisticsPeriodFilter, {
  type StatisticsRangePreset,
} from '@/components/StatisticsPeriodFilter.vue'
import TransactionDetailSheet from '@/components/TransactionDetailSheet.vue'
import { useRefreshOnActivated } from '@/composables/useRefreshOnActivated'
import {
  statisticsRange,
  useStatisticsService,
  type CategoryStatistics,
} from '@/features/statistics/statistics-service'

const route = useRoute()
const router = useRouter()
const service = useStatisticsService()
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

const range = computed(() =>
  statisticsRange(preset.value, {
    year: year.value,
    startDate: customStart.value,
    endDate: customEnd.value,
  }),
)
const maxDistribution = computed(() =>
  Math.max(1, ...(data.value?.distribution.map((item) => item.amountMinor) ?? [1])),
)
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
      <StatisticsPeriodFilter
        v-model:preset="preset"
        v-model:year="year"
        v-model:start-date="customStart"
        v-model:end-date="customEnd"
      />
      <p class="range-label">{{ range.label }}</p>
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
        <BaseCard>
          <h2>月度趋势</h2>
          <MonthlyBarChart :points="data.monthly" @select="selectedMonth = $event" />
          <p v-if="selectedMonth" class="chart-hint">
            已筛选 {{ selectedMonth }}，再次点击柱状图取消
          </p>
        </BaseCard>
        <BaseCard>
          <h2>分类构成</h2>
          <DistributionDonut :points="data.distribution" />
          <div class="distribution">
            <div v-for="item in data.distribution" :key="item.id">
              <span>{{ item.name }}</span>
              <i><b :style="{ width: `${(item.amountMinor / maxDistribution) * 100}%` }" /></i>
              <MoneyText :amount-minor="item.amountMinor" />
            </div>
            <p v-if="!data.distribution.length">暂无支出数据</p>
          </div>
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
.range-label,
.chart-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}
</style>
