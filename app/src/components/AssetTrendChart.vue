<script setup lang="ts">
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { graphic, init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { AssetTrendPoint } from '@/features/statistics/statistics-service'
import {
  assetTrendValueMinor,
  type AssetTrendMode,
} from '@/features/statistics/asset-statistics-presentation'

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  points: readonly AssetTrendPoint[]
  mode: AssetTrendMode
}>()

const chartElement = ref<HTMLDivElement>()
let chart: ECharts | undefined
let resizeObserver: ResizeObserver | undefined
let themeObserver: MutationObserver | undefined

function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function chartOption(): EChartsCoreOption {
  const liabilityMode = props.mode === 'liabilities'
  const color = cssColor(liabilityMode ? '--color-warning' : '--color-primary-500')
  const textColor = cssColor('--color-text-tertiary')
  const dividerColor = cssColor('--color-divider')
  const surfaceColor = cssColor('--color-surface')
  const primaryTextColor = cssColor('--color-text-primary')
  const values = props.points.map((point) => assetTrendValueMinor(point, props.mode) / 100)
  const lastIndex = Math.max(0, props.points.length - 1)
  const middleIndex = Math.round(lastIndex / 2)

  return {
    animationDuration: 320,
    animationEasing: 'cubicOut',
    grid: { top: 22, right: 10, bottom: 8, left: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: surfaceColor,
      borderColor: dividerColor,
      textStyle: { color: primaryTextColor, fontSize: 12 },
      formatter: (params: unknown) => formatTooltip(params),
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.points.map((point) => point.periodKey),
      axisLine: { lineStyle: { color: dividerColor } },
      axisTick: { show: false },
      axisLabel: {
        color: textColor,
        fontSize: 10,
        margin: 12,
        interval: 0,
        formatter: (value: string, index: number) =>
          index === 0 || index === middleIndex || index === lastIndex ? value : '',
      },
    },
    yAxis: {
      type: 'value',
      min: (range: { min: number; max: number }) =>
        range.min === 0 && range.max === 0 && liabilityMode ? -1 : Math.min(0, range.min),
      max: (range: { min: number; max: number }) =>
        range.min === 0 && range.max === 0 && !liabilityMode ? 1 : Math.max(0, range.max),
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: textColor,
        fontSize: 10,
        formatter: (value: number) => formatCompactNumber(value),
      },
      splitLine: { lineStyle: { color: dividerColor, type: 'dashed' } },
    },
    series: [
      {
        type: 'line',
        data: values,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: true,
        smooth: false,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        areaStyle: {
          origin: 'auto',
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: withAlpha(color, 0.52) },
            { offset: 1, color: withAlpha(color, 0.03) },
          ]),
        },
        emphasis: { focus: 'series' },
      },
    ],
  }
}

function renderChart(): void {
  if (!chartElement.value) return
  chart ??= init(chartElement.value)
  chart.setOption(chartOption(), true)
}

function formatTooltip(params: unknown): string {
  const first = Array.isArray(params) ? params[0] : undefined
  if (!first || typeof first !== 'object') return ''
  const item = first as { axisValue?: string; value?: number }
  const value = typeof item.value === 'number' ? item.value : Number(item.value ?? 0)
  return `${item.axisValue ?? ''}<br/><strong>${formatAmount(value)}</strong>`
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatCompactNumber(value: number): string {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000) return `${trimZero(value / 1_000_000)}M`
  if (absolute >= 1_000) return `${trimZero(value / 1_000)}K`
  return absolute < 0.005 ? '0.00' : trimZero(value)
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

function withAlpha(color: string, alpha: number): string {
  if (/^#[\da-f]{6}$/i.test(color)) {
    const red = Number.parseInt(color.slice(1, 3), 16)
    const green = Number.parseInt(color.slice(3, 5), 16)
    const blue = Number.parseInt(color.slice(5, 7), 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }
  return color
}

watch(() => [props.mode, ...props.points.flatMap((point) => Object.values(point))], renderChart)

onMounted(() => {
  renderChart()
  if (chartElement.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(chartElement.value)
  }
  themeObserver = new MutationObserver(renderChart)
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-color-theme'],
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div ref="chartElement" class="asset-trend-chart" role="img" aria-label="资产趋势图" />
</template>

<style scoped>
.asset-trend-chart {
  width: 100%;
  height: 250px;
}
</style>
