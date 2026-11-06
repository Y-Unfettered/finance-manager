<script setup lang="ts">
import { THEME_COLOR_FALLBACKS } from '@/design-system/color-fallbacks'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'

import { resolveCategoryColor } from '@/features/finance/category-color'

echarts.use([BarChart, CanvasRenderer])

const props = defineProps<{
  items: readonly {
    id: string
    name: string
    amountMinor: number
    color?: string
    isOther?: boolean
  }[]
}>()

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const sortedItems = computed(() =>
  [...props.items].sort((a, b) => Math.abs(b.amountMinor) - Math.abs(a.amountMinor)),
)

function buildOption() {
  const primaryColor = getCssVar('--color-primary-500') || THEME_COLOR_FALLBACKS.primary500
  const expenseColor = getCssVar('--color-expense') || THEME_COLOR_FALLBACKS.expense
  const textColor = getCssVar('--color-text-secondary') || THEME_COLOR_FALLBACKS.textSecondary
  const tertiaryColor = getCssVar('--color-text-tertiary') || THEME_COLOR_FALLBACKS.textTertiary

  const names = sortedItems.value.map((item) => item.name)
  const values = sortedItems.value.map((item) => Number((item.amountMinor / 100).toFixed(2)))
  const maxVal = Math.max(1, ...values.map((v) => Math.abs(v)))

  return {
    // containLabel:true 给类目轴标签让位，否则标签画在画布外被裁掉（PRD BUG-03）
    grid: { left: 8, right: 64, top: 4, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value',
      show: false,
      min: 0,
      max: maxVal * 1.2,
    },
    yAxis: {
      type: 'category',
      show: true,
      data: names,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: true,
        color: textColor,
        fontSize: 12,
        width: 100,
        overflow: 'truncate',
      },
    },
    series: [
      {
        type: 'bar',
        data: sortedItems.value.map((item) => ({
          value: Number((item.amountMinor / 100).toFixed(2)),
          itemStyle: {
            color: item.isOther
              ? tertiaryColor
              : item.color
                ? resolveCategoryColor(item.color)
                : item.amountMinor < 0
                  ? expenseColor
                  : primaryColor,
            borderRadius: [0, 6, 6, 0],
          },
        })),
        barMaxWidth: 10,
        label: {
          show: true,
          position: 'right',
          formatter: (params: unknown) => {
            const p = params as { value: number }
            return `¥${p.value.toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          },
          color: tertiaryColor,
          fontSize: 11,
        },
      },
    ],
  }
}

function renderChart(): void {
  if (!chartRef.value) return
  if (!chart) {
    chart = echarts.init(chartRef.value)
  }
  chart.setOption(buildOption(), true)
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

watch(() => props.items, () => nextTick(renderChart), { deep: true })
</script>

<template>
  <div v-if="sortedItems.length" class="distribution-bars">
    <div ref="chartRef" class="bar-chart" />
    <p class="bars-caption">支出 = 消费 − 退款，不含转账/还款</p>
  </div>
  <p v-else class="empty-hint">该区间无支出</p>
</template>

<style scoped>
.distribution-bars {
  width: 100%;
  min-height: 120px;
}

.bar-chart {
  width: 100%;
  height: 220px;
}

.empty-hint {
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--space-3);
}

.bars-caption {
  margin: var(--space-2) 0 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}
</style>
