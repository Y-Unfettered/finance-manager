<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import { useFinanceService, type HomeSnapshot } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'

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
const queryMonth = typeof route.query.month === 'string' ? route.query.month : ''
const period = ref(
  /^\d{4}-(0[1-9]|1[0-2])$/.test(queryMonth) ? queryMonth : store.selectedHomePeriod,
)
const mode = ref<ReportMode>('month')
const loading = ref(true)
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
const maxValue = computed(() =>
  Math.max(1, ...points.value.flatMap((point) => [point.incomeMinor, point.expenseMinor])),
)

function barHeight(value: number): string {
  return `${Math.max(value ? 5 : 0, (value / maxValue.value) * 118)}px`
}

async function load(): Promise<void> {
  if (!finance || !store.ledgerId) return
  loading.value = true
  store.selectHomePeriod(period.value)
  try {
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
    } else {
      const snapshot = await finance.loadHome(
        store.ledgerId,
        new Date(year.value, month.value - 1, 1),
      )
      incomeMinor.value = snapshot.summary.incomeMinor
      expenseMinor.value = snapshot.summary.expenseMinor
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

watch([period, mode], load)
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
        <input v-if="mode === 'month'" v-model="period" type="month" aria-label="选择月份" />
        <input
          v-else
          :value="year"
          type="number"
          min="1970"
          max="2200"
          aria-label="选择年份"
          @change="changeYear"
        />
      </div>

      <BaseCard class="report-trend">
        <header>
          <strong>收支趋势</strong>
          <span><i class="income" />收入 <i class="expense" />支出</span>
        </header>
        <div v-if="loading" class="report-state">正在生成报表…</div>
        <div v-else class="report-chart">
          <div v-for="point in points" :key="point.label" class="report-bar-group">
            <div>
              <i
                class="report-bar report-bar--income"
                :style="{ height: barHeight(point.incomeMinor) }"
              />
              <i
                class="report-bar report-bar--expense"
                :style="{ height: barHeight(point.expenseMinor) }"
              />
            </div>
            <small>{{ point.label }}</small>
          </div>
        </div>
      </BaseCard>

      <BaseCard class="report-kpis">
        <div><span>收入</span><MoneyText :amount-minor="incomeMinor" tone="income" /></div>
        <div><span>支出</span><MoneyText :amount-minor="expenseMinor" tone="expense" /></div>
        <div><span>结余</span><MoneyText :amount-minor="balanceMinor" /></div>
      </BaseCard>
    </div>
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
.report-controls input {
  width: 146px;
  height: 40px;
  padding: 0 12px;
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: 12px;
}
.report-trend {
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
  display: flex;
  height: 158px;
  align-items: end;
  gap: 7px;
  overflow-x: auto;
  scrollbar-width: none;
}
.report-bar-group {
  display: grid;
  min-width: 18px;
  align-items: end;
  justify-items: center;
  gap: 5px;
  flex: 1;
}
.report-bar-group > div {
  display: flex;
  height: 120px;
  align-items: end;
  gap: 2px;
}
.report-bar {
  display: block;
  width: 5px;
  min-height: 0;
  border-radius: 5px 5px 1px 1px;
}
.report-bar--income {
  background: var(--color-income);
}
.report-bar--expense {
  background: var(--color-expense);
}
.report-bar-group small {
  color: var(--color-text-tertiary);
  font-size: 9px;
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
</style>
