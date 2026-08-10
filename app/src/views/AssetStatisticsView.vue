<script setup lang="ts">
import { ChevronDown, SlidersHorizontal } from '@lucide/vue'
import { DatePicker, Picker, type DatePickerColumnType } from 'vant'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import 'vant/es/date-picker/style'
import 'vant/es/picker/style'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import AssetTrendChart from '@/components/AssetTrendChart.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import ShareBar from '@/components/ShareBar.vue'
import { useUiPreference } from '@/composables/useUiPreference'
import {
  assetSharePercent,
  compareAssetMonth,
  fillAssetTrendPoints,
  type AssetTrendMode,
} from '@/features/statistics/asset-statistics-presentation'
import {
  useStatisticsService,
  type AssetTrendPoint,
} from '@/features/statistics/statistics-service'
import { useAppStore } from '@/stores/app'

type AssetRange = 'year' | 'year_range' | 'all' | 'custom'
type PeriodPickerTarget = 'year' | 'startYear' | 'endYear' | 'startMonth' | 'endMonth'

const rangeOptions = [
  { text: '指定年份', value: 'year' },
  { text: '年份范围', value: 'year_range' },
  { text: '全部', value: 'all' },
  { text: '自定义月份', value: 'custom' },
]
const yearColumns: DatePickerColumnType[] = ['year']
const monthColumns: DatePickerColumnType[] = ['year', 'month']

const router = useRouter()
const store = useAppStore()
const service = useStatisticsService()
const currentDate = new Date()
const currentYear = currentDate.getFullYear()
const currentMonth = currentDate.getMonth() + 1
const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
const rangeType = ref<AssetRange>('year')
const year = ref(currentYear)
const startYear = ref(currentYear - 2)
const endYear = ref(currentYear)
const startMonth = ref(`${currentYear}-01`)
const endMonth = ref(currentPeriod)
const rangePickerShow = ref(false)
const rangePickerValue = ref<string[]>([rangeType.value])
const periodPickerShow = ref(false)
const periodPickerTarget = ref<PeriodPickerTarget>('year')
const periodPickerValue = ref<string[]>([String(currentYear)])
const pickerMinDate = new Date(1970, 0, 1)
const pickerMaxDate = new Date(currentYear, currentMonth - 1, 1)
const mode = useUiPreference<AssetTrendMode>('asset-statistics:mode', 'net', [
  'net',
  'assets',
  'liabilities',
])
const points = ref<AssetTrendPoint[]>([])
const loading = ref(true)
const error = ref('')

const rangeLabel = computed(() => {
  if (rangeType.value === 'year') return `${year.value} 年`
  if (rangeType.value === 'year_range') return `${startYear.value}—${endYear.value} 年`
  if (rangeType.value === 'custom') return `${startMonth.value}—${endMonth.value}`
  return '全部记录'
})
const periodPickerTitle = computed(() => {
  if (periodPickerTarget.value === 'year') return '选择年份'
  if (periodPickerTarget.value === 'startYear') return '选择开始年份'
  if (periodPickerTarget.value === 'endYear') return '选择结束年份'
  if (periodPickerTarget.value === 'startMonth') return '选择开始月份'
  return '选择结束月份'
})
const periodPickerColumns = computed(() =>
  periodPickerTarget.value === 'startMonth' || periodPickerTarget.value === 'endMonth'
    ? monthColumns
    : yearColumns,
)
const displayBounds = computed(() => {
  if (rangeType.value === 'year') {
    return {
      start: `${year.value}-01`,
      end: minPeriod(`${year.value}-12`, currentPeriod),
    }
  }
  if (rangeType.value === 'year_range') {
    return {
      start: `${startYear.value}-01`,
      end: minPeriod(`${endYear.value}-12`, currentPeriod),
    }
  }
  if (rangeType.value === 'custom') {
    return { start: startMonth.value, end: minPeriod(endMonth.value, currentPeriod) }
  }
  return {
    start: points.value[0]?.periodKey ?? currentPeriod,
    end: currentPeriod,
  }
})
const displayPoints = computed(() =>
  fillAssetTrendPoints(points.value, displayBounds.value.start, displayBounds.value.end),
)
const monthCards = computed(() =>
  [...displayPoints.value].reverse().map((point) => ({
    point,
    comparison: compareAssetMonth(point),
    assetShare: assetSharePercent(point),
    realtime: point.periodKey === currentPeriod,
  })),
)

function minPeriod(left: string, right: string): string {
  return left < right ? left : right
}

function openRangePicker(): void {
  rangePickerValue.value = [rangeType.value]
  rangePickerShow.value = true
}

function confirmRange(): void {
  const selected = rangePickerValue.value[0] as AssetRange | undefined
  if (selected && rangeOptions.some((option) => option.value === selected)) {
    rangeType.value = selected
  }
  rangePickerShow.value = false
}

function openTitlePicker(): void {
  if (rangeType.value === 'year') openPeriodPicker('year')
  else openRangePicker()
}

function openPeriodPicker(target: PeriodPickerTarget): void {
  periodPickerTarget.value = target
  if (target === 'year') periodPickerValue.value = [String(year.value)]
  if (target === 'startYear') periodPickerValue.value = [String(startYear.value)]
  if (target === 'endYear') periodPickerValue.value = [String(endYear.value)]
  if (target === 'startMonth') periodPickerValue.value = startMonth.value.split('-')
  if (target === 'endMonth') periodPickerValue.value = endMonth.value.split('-')
  periodPickerShow.value = true
}

function confirmPeriod(): void {
  const [selectedYear, selectedMonth] = periodPickerValue.value
  if (!selectedYear) return
  if (periodPickerTarget.value === 'year') year.value = Number(selectedYear)
  if (periodPickerTarget.value === 'startYear') startYear.value = Number(selectedYear)
  if (periodPickerTarget.value === 'endYear') endYear.value = Number(selectedYear)
  if (periodPickerTarget.value === 'startMonth' && selectedMonth) {
    startMonth.value = `${selectedYear}-${selectedMonth.padStart(2, '0')}`
  }
  if (periodPickerTarget.value === 'endMonth' && selectedMonth) {
    endMonth.value = `${selectedYear}-${selectedMonth.padStart(2, '0')}`
  }
  periodPickerShow.value = false
}

async function load(): Promise<void> {
  if (!service || !store.ledgerId) {
    loading.value = false
    error.value = '账本尚未准备好，请稍后重试'
    return
  }
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

function comparisonLabel(direction: 'increase' | 'decrease' | 'unchanged'): string {
  if (direction === 'decrease') return '减少'
  if (direction === 'increase') return '增长'
  return '持平'
}

function openStatement(periodKey: string): void {
  void router.push({ name: 'asset-statement', params: { periodKey } })
}

watch([rangeType, year, startYear, endYear, startMonth, endMonth], load)
onMounted(load)
</script>

<template>
  <main class="stats-page asset-statistics-page">
    <div class="safe-top">
      <AppTopBar
        :title="rangeLabel"
        period-switchable
        @back="router.back()"
        @select-period="openTitlePicker"
      >
        <template #right>
          <AppIconButton label="选择统计范围" @click="openRangePicker">
            <SlidersHorizontal :size="21" :stroke-width="1.8" aria-hidden="true" />
          </AppIconButton>
        </template>
      </AppTopBar>
    </div>

    <div class="content">
      <div v-if="rangeType === 'year_range'" class="range-editor">
        <button type="button" @click="openPeriodPicker('startYear')">
          {{ startYear }} 年<ChevronDown :size="15" />
        </button>
        <span>至</span>
        <button type="button" @click="openPeriodPicker('endYear')">
          {{ endYear }} 年<ChevronDown :size="15" />
        </button>
      </div>
      <div v-else-if="rangeType === 'custom'" class="range-editor">
        <button type="button" @click="openPeriodPicker('startMonth')">
          {{ startMonth }}<ChevronDown :size="15" />
        </button>
        <span>至</span>
        <button type="button" @click="openPeriodPicker('endMonth')">
          {{ endMonth }}<ChevronDown :size="15" />
        </button>
      </div>

      <div v-if="error" class="state error">{{ error }}</div>
      <template v-else>
        <BaseCard class="trend-card">
          <div class="trend-tabs" role="tablist" aria-label="资产趋势类型">
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'net'"
              :class="{ active: mode === 'net' }"
              @click="mode = 'net'"
            >
              净资产
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'assets'"
              :class="{ active: mode === 'assets' }"
              @click="mode = 'assets'"
            >
              总资产
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'liabilities'"
              :class="{ active: mode === 'liabilities' }"
              @click="mode = 'liabilities'"
            >
              总负债
            </button>
          </div>
          <div v-if="loading" class="chart-state">正在生成趋势…</div>
          <AssetTrendChart v-else :points="displayPoints" :mode="mode" />
        </BaseCard>

        <div v-if="!loading" class="asset-timeline">
          <article v-for="card in monthCards" :key="card.point.periodKey" class="month-entry">
            <div class="month-entry__marker">{{ card.point.periodKey.slice(5) }}</div>
            <BaseCard class="month-card">
              <button
                type="button"
                class="month-card__button"
                :aria-label="`查看 ${card.point.periodKey} 资产负债表`"
                @click="openStatement(card.point.periodKey)"
              >
                <span v-if="card.realtime" class="month-card__realtime">实时</span>
                <div class="month-card__headline">
                  <div>
                    <small>净资产</small>
                    <MoneyText :amount-minor="card.point.netAssetsMinor" :show-currency="false" />
                  </div>
                  <span
                    v-if="card.comparison.direction !== 'unchanged'"
                    class="change-badge"
                    :class="`change-badge--${card.comparison.direction}`"
                  >
                    {{
                      Math.abs(card.comparison.percent).toLocaleString('zh-CN', {
                        maximumFractionDigits: 1,
                      })
                    }}% {{ card.comparison.direction === 'increase' ? '↑' : '↓' }}
                  </span>
                </div>
                <p class="month-card__comparison">
                  相对上月{{ comparisonLabel(card.comparison.direction) }}
                  <MoneyText
                    :amount-minor="Math.abs(card.comparison.changeMinor)"
                    :show-currency="false"
                    :tone="
                      card.comparison.direction === 'increase'
                        ? 'income'
                        : card.comparison.direction === 'decrease'
                          ? 'expense'
                          : 'default'
                    "
                  />
                </p>
                <div class="month-card__totals">
                  <div>
                    <small>资产</small>
                    <MoneyText :amount-minor="card.point.assetsMinor" :show-currency="false" />
                  </div>
                  <div>
                    <small>负债</small>
                    <MoneyText
                      :amount-minor="
                        card.point.liabilitiesMinor === 0 ? 0 : -card.point.liabilitiesMinor
                      "
                      :show-currency="false"
                    />
                  </div>
                </div>
                <ShareBar :percent="card.assetShare" />
              </button>
            </BaseCard>
          </article>
        </div>
      </template>
    </div>

    <AppBottomSheet v-model:show="rangePickerShow" title="选择统计范围">
      <Picker v-model="rangePickerValue" :columns="rangeOptions" :show-toolbar="false" />
      <button class="picker-confirm" type="button" @click="confirmRange">确定</button>
    </AppBottomSheet>
    <AppBottomSheet v-model:show="periodPickerShow" :title="periodPickerTitle">
      <DatePicker
        v-model="periodPickerValue"
        :columns-type="periodPickerColumns"
        :min-date="pickerMinDate"
        :max-date="pickerMaxDate"
        :show-toolbar="false"
      />
      <button class="picker-confirm" type="button" @click="confirmPeriod">确定</button>
    </AppBottomSheet>
  </main>
</template>

<style scoped src="./statistics-shared.css"></style>
<style scoped>
.asset-statistics-page .content {
  gap: var(--space-4);
}
.range-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
}
.range-editor button {
  display: inline-flex;
  min-width: 116px;
  height: 38px;
  padding: 0 var(--space-3);
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  color: var(--color-text-primary);
  font: inherit;
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.trend-card {
  padding: var(--space-3) var(--space-3) var(--space-2);
  overflow: hidden;
}
.trend-tabs {
  display: grid;
  width: min(240px, 80%);
  padding: 3px;
  margin: 0 auto var(--space-2);
  grid-template-columns: repeat(3, 1fr);
  background: var(--color-background);
  border-radius: var(--radius-pill);
}
.trend-tabs button {
  height: 34px;
  padding: 0 var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  transition:
    color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}
.trend-tabs button.active {
  color: var(--color-text-primary);
  font-weight: 650;
  background: var(--color-surface);
  box-shadow: 0 1px 6px rgb(23 33 30 / 8%);
}
.chart-state {
  display: grid;
  height: 250px;
  place-items: center;
  color: var(--color-text-tertiary);
}
.asset-timeline {
  display: grid;
  gap: var(--space-4);
}
.month-entry {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
}
.month-entry__marker {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: white;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  background: var(--color-primary-500);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgb(var(--color-primary-rgb) / 20%);
}
.month-card {
  position: relative;
  padding: 0;
  overflow: hidden;
}
.month-card__button {
  display: block;
  width: 100%;
  padding: var(--space-4);
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}
.month-card__realtime {
  position: absolute;
  top: 0;
  right: 0;
  padding: 7px 11px;
  color: var(--color-info);
  font-size: var(--type-caption-size);
  background: color-mix(in srgb, var(--color-info) 13%, var(--color-surface));
  border-radius: 0 0 0 var(--radius-control);
}
.month-card__headline {
  display: flex;
  min-height: 55px;
  padding-right: 48px;
  align-items: end;
  gap: var(--space-3);
}
.month-card__headline > div {
  display: grid;
}
.month-card__headline small,
.month-card__totals small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.month-card__headline :deep(.money-text) {
  margin-top: 2px;
  font-size: 27px;
  font-weight: 650;
  line-height: 32px;
}
.change-badge {
  padding: 6px 9px;
  margin-bottom: 2px;
  font-size: var(--type-label-size);
  font-variant-numeric: tabular-nums;
  border-radius: 7px;
}
.change-badge--increase {
  color: var(--color-income);
  background: color-mix(in srgb, var(--color-income) 12%, transparent);
}
.change-badge--decrease {
  color: var(--color-expense);
  background: color-mix(in srgb, var(--color-expense) 12%, transparent);
}
.month-card__comparison {
  display: flex;
  margin: var(--space-2) 0 var(--space-3);
  gap: var(--space-1);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.month-card__totals {
  display: grid;
  padding-top: var(--space-3);
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
  border-top: 1px solid var(--color-divider);
}
.month-card__totals > div {
  display: grid;
  gap: 2px;
}
.month-card__totals :deep(.money-text) {
  font-size: 17px;
  font-weight: 650;
}
.picker-confirm {
  width: 100%;
  height: 46px;
  margin-top: var(--space-2);
  color: white;
  font-size: 15px;
  font-weight: 650;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}
</style>
