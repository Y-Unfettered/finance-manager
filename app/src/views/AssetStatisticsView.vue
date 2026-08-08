<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import {
  useStatisticsService,
  type AssetTrendPoint,
} from '@/features/statistics/statistics-service'
import { useAppStore } from '@/stores/app'

type AssetRange = 'year' | 'year_range' | 'all' | 'custom'

const router = useRouter()
const store = useAppStore()
const service = useStatisticsService()
const currentYear = new Date().getFullYear()
const rangeType = ref<AssetRange>('year')
const year = ref(currentYear)
const startYear = ref(currentYear - 2)
const endYear = ref(currentYear)
const startMonth = ref(`${currentYear}-01`)
const endMonth = ref(`${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
const mode = ref<'net' | 'assets' | 'liabilities'>('net')
const points = ref<AssetTrendPoint[]>([])
const loading = ref(true)
const error = ref('')
const values = computed(() =>
  points.value.map((point) =>
    mode.value === 'net'
      ? point.netAssetsMinor
      : mode.value === 'assets'
        ? point.assetsMinor
        : point.liabilitiesMinor,
  ),
)
const min = computed(() => Math.min(0, ...values.value))
const max = computed(() => Math.max(1, ...values.value))
const polyline = computed(() =>
  values.value
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.value.length - 1)) * 300},${110 - ((value - min.value) / (max.value - min.value || 1)) * 100}`,
    )
    .join(' '),
)
const rangeLabel = computed(() => {
  if (rangeType.value === 'year') return `${year.value} 年`
  if (rangeType.value === 'year_range') return `${startYear.value}—${endYear.value} 年`
  if (rangeType.value === 'custom') return `${startMonth.value}—${endMonth.value}`
  return '全部'
})

async function load(): Promise<void> {
  if (!service || !store.ledgerId) return
  loading.value = true
  error.value = ''
  try {
    if (rangeType.value === 'year') {
      points.value = await service.assets(store.ledgerId, year.value)
    } else if (rangeType.value === 'year_range') {
      if (startYear.value > endYear.value) throw new Error('开始年份不能晚于结束年份')
      points.value = await service.assetsRange(
        store.ledgerId,
        `${startYear.value}-01`,
        `${endYear.value}-12`,
      )
    } else if (rangeType.value === 'custom') {
      if (startMonth.value > endMonth.value) throw new Error('开始月份不能晚于结束月份')
      points.value = await service.assetsRange(store.ledgerId, startMonth.value, endMonth.value)
    } else {
      points.value = await service.assetsRange(store.ledgerId)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

watch([rangeType, year, startYear, endYear, startMonth, endMonth], load)
onMounted(load)
</script>

<template>
  <main class="stats-page">
    <div class="safe-top"><AppTopBar title="资产统计" @back="router.back()" /></div>
    <div class="content">
      <div class="asset-filter">
        <select v-model="rangeType" aria-label="资产统计日期范围">
          <option value="year">指定年份</option>
          <option value="year_range">年份范围</option>
          <option value="all">全部</option>
          <option value="custom">自定义月份</option>
        </select>
        <input
          v-if="rangeType === 'year'"
          v-model.number="year"
          type="number"
          min="1970"
          max="2200"
        />
        <template v-else-if="rangeType === 'year_range'">
          <input v-model.number="startYear" type="number" min="1970" max="2200" />
          <span>至</span>
          <input v-model.number="endYear" type="number" min="1970" max="2200" />
        </template>
        <template v-else-if="rangeType === 'custom'">
          <input v-model="startMonth" type="month" />
          <span>至</span>
          <input v-model="endMonth" type="month" />
        </template>
      </div>
      <p class="range-label">{{ rangeLabel }}</p>
      <div class="tabs">
        <button :class="{ active: mode === 'net' }" @click="mode = 'net'">净资产</button>
        <button :class="{ active: mode === 'assets' }" @click="mode = 'assets'">资产</button>
        <button :class="{ active: mode === 'liabilities' }" @click="mode = 'liabilities'">
          负债
        </button>
      </div>
      <div v-if="loading" class="state">正在统计…</div>
      <div v-else-if="error" class="state error">{{ error }}</div>
      <template v-else>
        <BaseCard class="trend-card">
          <h2>资产趋势</h2>
          <svg
            class="line-chart"
            viewBox="0 0 300 120"
            preserveAspectRatio="none"
            role="img"
            aria-label="资产趋势图"
          >
            <line x1="0" y1="110" x2="300" y2="110" />
            <polyline :points="polyline" />
          </svg>
          <div class="month-labels">
            <span v-for="point in points" :key="point.periodKey">{{ point.periodKey }}</span>
          </div>
        </BaseCard>
        <BaseCard v-for="point in [...points].reverse()" :key="point.periodKey" class="asset-month">
          <header>
            <strong>{{ point.periodKey }}</strong>
            <span :class="point.changeMinor >= 0 ? 'income' : 'expense'">
              {{ point.changeMinor >= 0 ? '+' : '' }}¥{{ (point.changeMinor / 100).toFixed(2) }}
            </span>
          </header>
          <div>
            <span>净资产<MoneyText :amount-minor="point.netAssetsMinor" /></span>
            <span>资产<MoneyText :amount-minor="point.assetsMinor" /></span>
            <span>负债<MoneyText :amount-minor="point.liabilitiesMinor" /></span>
          </div>
        </BaseCard>
        <div v-if="!points.length" class="state">当前范围还没有资产数据</div>
      </template>
    </div>
  </main>
</template>

<style scoped src="./statistics-shared.css"></style>
<style scoped>
.asset-filter {
  display: flex;
  min-height: 44px;
  padding: var(--space-2);
  align-items: center;
  gap: var(--space-2);
  overflow-x: auto;
  background: var(--color-surface);
  border-radius: var(--radius-control);
}
.asset-filter select,
.asset-filter input {
  min-width: 108px;
  height: 36px;
  padding: 0 var(--space-2);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.asset-filter span,
.range-label {
  color: var(--color-text-tertiary);
  white-space: nowrap;
}
.range-label {
  margin: 0;
  font-size: var(--type-caption-size);
  text-align: center;
}
.tabs {
  display: grid;
  padding: 3px;
  grid-template-columns: repeat(3, 1fr);
  background: var(--color-surface);
  border-radius: 999px;
}
.tabs button {
  height: 38px;
  background: transparent;
  border: 0;
  border-radius: 999px;
}
.tabs .active {
  color: white;
  background: var(--color-primary-600);
}
.trend-card {
  overflow-x: auto;
}
.line-chart {
  width: 100%;
  min-width: 300px;
  height: 150px;
}
.line-chart line {
  stroke: var(--color-divider);
  stroke-width: 1;
}
.line-chart polyline {
  fill: none;
  stroke: var(--color-primary-500);
  stroke-width: 3;
  vector-effect: non-scaling-stroke;
}
.month-labels {
  display: flex;
  min-width: max-content;
  gap: var(--space-3);
  color: var(--color-text-tertiary);
  font-size: 9px;
}
.asset-month header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.asset-month > div {
  display: grid;
  margin-top: var(--space-3);
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}
.asset-month > div span {
  display: grid;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.asset-month :deep(.money-text) {
  color: var(--color-text-primary);
  font-weight: 600;
}
.income {
  color: var(--color-income);
}
.expense {
  color: var(--color-expense);
}
</style>
