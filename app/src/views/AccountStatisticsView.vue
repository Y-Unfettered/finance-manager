<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import DistributionBars from '@/components/DistributionBars.vue'
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
  type AccountStatistics,
} from '@/features/statistics/statistics-service'

const route = useRoute()
const router = useRouter()
const service = useStatisticsService()
const preset = ref<StatisticsRangePreset>('this_year')
const year = ref(new Date().getFullYear())
const customStart = ref('')
const customEnd = ref('')
const data = ref<AccountStatistics>()
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
const displayedActivities = computed(() =>
  selectedMonth.value
    ? (data.value?.activities.filter((item) => item.occurredAt.startsWith(selectedMonth.value!)) ??
      [])
    : (data.value?.activities ?? []),
)

async function load(
  options: { preserveSelection?: boolean; silent?: boolean } = {},
): Promise<void> {
  if (!service) return
  if (!options.silent) loading.value = true
  error.value = ''
  if (!options.preserveSelection) selectedMonth.value = undefined
  try {
    data.value = await service.account(String(route.params.accountId), range.value)
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
      <AppTopBar :title="`账户统计${data ? ` - ${data.name}` : ''}`" @back="router.back()" />
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
          <div><span>总流入</span><MoneyText :amount-minor="data.inflowMinor" tone="income" /></div>
          <div>
            <span>总流出</span><MoneyText :amount-minor="data.outflowMinor" tone="expense" />
          </div>
          <div><span>净流入</span><MoneyText :amount-minor="data.netMinor" /></div>
          <div><span>转账/还款</span><MoneyText :amount-minor="data.transferRepaymentMinor" /></div>
          <div>
            <span>交易笔数</span><strong>{{ data.transactionCount }}</strong>
          </div>
        </BaseCard>
        <BaseCard>
          <h2>月度流入流出</h2>
          <MonthlyBarChart :points="data.monthly" @select="selectedMonth = $event" />
          <p v-if="selectedMonth" class="chart-hint">
            已筛选 {{ selectedMonth }}，再次点击柱状图取消
          </p>
        </BaseCard>
        <BaseCard>
          <h2>支出分类</h2>
          <DistributionDonut :points="data.distribution" />
          <DistributionBars :items="data.distribution" />
        </BaseCard>
        <BaseCard class="tx-list">
          <h2>账户明细</h2>
          <button
            v-for="tx in displayedActivities"
            :key="tx.id"
            type="button"
            @click="open(tx.transactionId)"
          >
            <span
              ><strong>{{ tx.title }}</strong
              ><small>{{ tx.occurredAt.slice(0, 10) }}</small></span
            >
            <MoneyText
              :amount-minor="tx.changeMinor"
              :tone="tx.changeMinor > 0 ? 'income' : tx.changeMinor < 0 ? 'expense' : 'default'"
            />
          </button>
          <p v-if="!displayedActivities.length">暂无交易</p>
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
