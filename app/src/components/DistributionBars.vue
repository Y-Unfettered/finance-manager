<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, CanvasRenderer])

const props = defineProps<{
  items: readonly { id: string; name: string; amountMinor: number }[]
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
  const primaryColor = getCssVar('--color-primary-500') || '#248561'
  const expenseColor = getCssVar('--color-expense') || '#d45f5a'
  const textColor = getCssVar('--color-text-secondary') || '#666'
  const tertiaryColor = getCssVar('--color-text-tertiary') || '#999'

  const names = sortedItems.value.map((item) => item.name)
  const values = sortedItems.value.map((item) => Number((item.amountMinor / 100).toFixed(2)))
  const maxVal = Math.max(1, ...values.map((v) => Math.abs(v)))

  return {
    grid: { left: 0, right: 50, top: 4, bottom: 4, containLabel: false },
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
            color: item.amountMinor < 0 ? expenseColor : primaryColor,
            borderRadius: [0, 6, 6, 0],
          },
        })),
        barMaxWidth: 10,
        label: {
          show: true,
          position: 'right',
          formatter: (params: unknown) => {
            const p = params as { value: number }
            return `¥${p.value.toFixed(2)}`
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
  </div>
  <p v-else class="empty-hint">暂无支出数据</p>
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
</style>
