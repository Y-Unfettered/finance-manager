<script setup lang="ts">
import { MoreHorizontal } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { BarSeriesOption } from 'echarts/charts'

import BaseCard from './BaseCard.vue'
import type { RecentSummary } from '@/features/finance/finance-service'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ summary: RecentSummary; displayType: 'expense' | 'income_expense' }>()
defineEmits<{ settings: [] }>()

const chartContainer = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let tooltipTimer: ReturnType<typeof setTimeout> | null = null

function scheduleTooltipHide(): void {
  if (tooltipTimer) clearTimeout(tooltipTimer)
  tooltipTimer = setTimeout(() => {
    chart?.dispatchAction({ type: 'hideTooltip' })
    tooltipTimer = null
  }, 2000)
}

const showIncome = computed(() => props.displayType === 'income_expense')

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const incomeColor = ref('#248561')
const expenseColor = ref('#d45f5a')

function syncColors(): void {
  const inc = getCssVar('--color-income')
  const exp = getCssVar('--color-expense')
  if (inc) incomeColor.value = inc
  if (exp) expenseColor.value = exp
}

function dayLabel(date: string): string {
  const value = new Date(`${date}T00:00:00`)
  if (props.summary.points.length <= 7) {
    return `周${['日', '一', '二', '三', '四', '五', '六'][value.getDay()]}`
  }
  return String(value.getDate())
}

function tooltipFormatter(params: unknown): string {
  const p = params as { name: string; value: number; seriesName: string; dataIndex: number }[]
  const point = props.summary.points[p[0]?.dataIndex ?? 0]
  if (!point) return ''
  const d = new Date(`${point.date}T00:00:00`)
  const monthDay = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const inc = `¥${(point.incomeMinor / 100).toFixed(2)}`
  const exp = `¥${(point.expenseMinor / 100).toFixed(2)}`
  return `<div style="background:#1a1a1a;color:#fff;border-radius:8px;padding:6px 10px;font-size:11px;line-height:1.5;min-width:auto;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
      <span style="font-weight:600;">${monthDay}</span>
      <span style="color:#aaa;">${weekday}</span>
    </div>
    <div>收入：${inc}</div>
    <div>支出：${exp}</div>
  </div>`
}

function buildOption() {
  const points = props.summary.points
  const xData = points.map((p) => dayLabel(p.date))
  const expenseData = points.map((p) => Number((p.expenseMinor / 100).toFixed(2)))
  const incomeData = points.map((p) => Number((p.incomeMinor / 100).toFixed(2)))

  const series: BarSeriesOption[] = [
    {
      name: '支出',
      type: 'bar',
      data: expenseData,
      itemStyle: { color: expenseColor.value, borderRadius: [3, 3, 0, 0] },
      barMaxWidth: 14,
    },
  ]

  if (showIncome.value) {
    series.unshift({
      name: '收入',
      type: 'bar',
      data: incomeData,
      itemStyle: { color: incomeColor.value, borderRadius: [3, 3, 0, 0] },
      barMaxWidth: 14,
    })
  }

  return {
    grid: { left: 0, right: 0, top: 8, bottom: 20, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: tooltipFormatter,
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      extraCssText: 'box-shadow:none;',
    },
    xAxis: {
      type: 'category',
      data: xData,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#999', fontSize: 10, interval: 0 },
    },
    yAxis: { show: false, type: 'value' },
    series,
  }
}

function renderChart(): void {
  if (!chartContainer.value) return
  syncColors()
  if (!chart) {
    chart = echarts.init(chartContainer.value)
  }
  chart.setOption(buildOption())
}

function handleResize(): void {
  chart?.resize()
}

function handleChartInteraction(): void {
  scheduleTooltipHide()
}

onMounted(() => {
  nextTick(renderChart)
  window.addEventListener('resize', handleResize)
  chartContainer.value?.addEventListener('click', handleChartInteraction)
  chartContainer.value?.addEventListener('touchstart', handleChartInteraction)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartContainer.value?.removeEventListener('click', handleChartInteraction)
  chartContainer.value?.removeEventListener('touchstart', handleChartInteraction)
  if (tooltipTimer) {
    clearTimeout(tooltipTimer)
    tooltipTimer = null
  }
  chart?.dispose()
  chart = null
})

watch(
  () => [props.summary, props.displayType] as const,
  () => nextTick(renderChart),
)
</script>

<template>
  <BaseCard class="summary-card">
    <header>
      <div>
        <strong>{{ summary.label }}</strong>
        <small>
          收入：{{ (summary.incomeMinor / 100).toFixed(2) }}，支出：{{
            (summary.expenseMinor / 100).toFixed(2)
          }}
        </small>
      </div>
      <button type="button" aria-label="设置最近汇总" @click="$emit('settings')">
        <MoreHorizontal :size="22" />
      </button>
    </header>
    <div ref="chartContainer" class="chart" />
  </BaseCard>
</template>

<style scoped>
.summary-card {
  display: grid;
  padding: var(--space-3) var(--space-4);
  gap: var(--space-3);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
header strong {
  font-size: var(--type-section-title-size);
  font-weight: 700;
}
header > div {
  display: grid;
  gap: 1px;
}
header small {
  color: var(--color-text-tertiary);
  font-size: 12px;
  line-height: 18px;
}
header button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: var(--color-text-tertiary);
  background: transparent;
  border: 0;
}
.chart {
  width: 100%;
  height: 96px;
}
</style>
