<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  points: readonly {
    periodKey: string
    incomeMinor?: number
    expenseMinor?: number
    inflowMinor?: number
    outflowMinor?: number
  }[]
}>()
const emit = defineEmits<{ select: [periodKey: string | undefined] }>()

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
const selected = ref<string>()

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildOption() {
  const incomeColor = getCssVar('--color-income') || '#248561'
  const expenseColor = getCssVar('--color-expense') || '#d45f5a'
  const xData = props.points.map((p) => `${Number(p.periodKey.slice(5))}月`)
  const incomeData = props.points.map((p) =>
    Number(((p.incomeMinor ?? p.inflowMinor ?? 0) / 100).toFixed(2)),
  )
  const expenseData = props.points.map((p) =>
    Number(((p.expenseMinor ?? p.outflowMinor ?? 0) / 100).toFixed(2)),
  )

  return {
    grid: { left: 0, right: 0, top: 8, bottom: 22, containLabel: false },
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
      axisLabel: { color: getCssVar('--color-text-tertiary') || '#999', fontSize: 9, interval: 0 },
    },
    yAxis: { show: false, type: 'value' },
    series: [
      {
        name: '收入',
        type: 'bar',
        data: incomeData,
        itemStyle: { color: incomeColor, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 7,
        barGap: '20%',
      },
      {
        name: '支出',
        type: 'bar',
        data: expenseData,
        itemStyle: { color: expenseColor, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 7,
      },
    ],
  }
}

function renderChart(): void {
  if (!chartRef.value) return
  if (!chart) {
    chart = echarts.init(chartRef.value)
    chart.on('click', (params: unknown) => {
      const p = params as { dataIndex: number }
      const periodKey = props.points[p.dataIndex]?.periodKey
      selected.value = selected.value === periodKey ? undefined : periodKey
      emit('select', selected.value)
    })
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

watch(() => props.points, () => nextTick(renderChart), { deep: true })
</script>

<template>
  <div ref="chartRef" class="monthly-chart" />
</template>

<style scoped>
.monthly-chart {
  width: 100%;
  height: 132px;
}
</style>
