<script setup lang="ts">
import { THEME_COLOR_FALLBACKS } from '@/design-system/color-fallbacks'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { resolveCategoryColor } from '@/features/finance/category-color'
import { distributionColorAt } from '@/features/statistics/distribution-colors'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  points: readonly {
    id: string
    name: string
    amountMinor: number
    color?: string
    isOther?: boolean
  }[]
}>()

const donutRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let chartEl: HTMLElement | null = null

const selectedId = ref<string>()

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** "其他"归并项用中性灰，与真实分类的固定配色区分（PRD BUG-04）。 */
function colorFor(point: { color?: string; isOther?: boolean }, index: number): string {
  if (point.isOther) return getCssVar('--color-text-tertiary') || THEME_COLOR_FALLBACKS.gray
  if (point.color) return resolveCategoryColor(point.color)
  // 无分类色的切片按序取共享调色板（与条形图同色同序）
  return distributionColorAt(index)
}

const positivePoints = computed(() => props.points.filter((point) => point.amountMinor > 0))
const total = computed(() =>
  positivePoints.value.reduce((sum, point) => sum + point.amountMinor, 0),
)
const selected = computed(
  () =>
    positivePoints.value.find((point) => point.id === selectedId.value) ?? positivePoints.value[0],
)

function buildOption() {
  const data = positivePoints.value.map((point, index) => ({
    name: point.name,
    value: point.amountMinor / 100,
    itemStyle: { color: colorFor(point, index) },
  }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number }
        return `${p.name}<br/>¥${p.value.toFixed(2)} (${p.percent.toFixed(1)}%)`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '80%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data,
        emphasis: {
          scale: true,
          scaleSize: 4,
        },
      },
    ],
  }
}

function renderChart(): void {
  const el = donutRef.value
  if (!el) return
  // 容器被 v-if 卸载后重建时（分布短暂为空再恢复），实例与元素不匹配必须重新
  // init，否则画在已分离的旧画布上、环消失（2026-11-07 回测）
  if (!chart || chartEl !== el) {
    chart?.dispose()
    chart = echarts.init(el)
    chartEl = el
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

watch(
  positivePoints,
  (points) => {
    if (!points.some((point) => point.id === selectedId.value)) selectedId.value = points[0]?.id
    nextTick(renderChart)
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="positivePoints.length" class="donut-layout">
    <div class="donut-wrapper">
      <div ref="donutRef" class="donut-chart" />
      <div class="donut-center">
        <small>{{ selected?.name ?? '合计' }}</small>
        <strong>¥{{ ((selected?.amountMinor ?? total) / 100).toFixed(2) }}</strong>
      </div>
    </div>
    <div class="legend">
      <button
        v-for="(point, index) in positivePoints"
        :key="point.id"
        type="button"
        :class="{ active: selected?.id === point.id }"
        @click="selectedId = point.id"
      >
        <i :style="{ background: colorFor(point, index) }" />
        <span>{{ point.name }}</span>
        <strong>{{ ((point.amountMinor / total) * 100).toFixed(1) }}%</strong>
      </button>
    </div>
  </div>
</template>

<style scoped>
.donut-layout {
  display: grid;
  grid-template-columns: 126px 1fr;
  align-items: center;
  gap: var(--space-4);
}
.donut-wrapper {
  position: relative;
  width: 126px;
  height: 126px;
}
.donut-chart {
  width: 100%;
  height: 100%;
}
.donut-center {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  width: 82px;
  height: 82px;
  padding: var(--space-2);
  place-items: center;
  align-content: center;
  overflow: hidden;
  text-align: center;
  color: var(--color-text-primary);
  background: var(--color-surface);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.donut-center small {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.donut-center strong {
  font-size: var(--type-label-size);
}
.legend {
  /* 不再做 154px 滚动窗口：归一化后最多 9 项，完整展示；
     此前裁切窗口紧贴条形图，观感像被挡住（2026-11-07 回测反馈） */
  display: grid;
}
.legend button {
  display: grid;
  min-height: 34px;
  padding: 0 var(--space-1);
  grid-template-columns: 8px 1fr auto;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
}
.legend button.active {
  color: var(--color-text-primary);
  background: var(--color-primary-50);
}
.legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.legend strong {
  font-size: var(--type-caption-size);
}
</style>
