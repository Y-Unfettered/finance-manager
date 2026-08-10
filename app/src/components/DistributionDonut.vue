<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  points: readonly { id: string; name: string; amountMinor: number }[]
}>()

const donutRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

const selectedId = ref<string>()
const colors = [
  'var(--color-primary-500)',
  '#d8a248',
  '#5b8def',
  '#d45f5a',
  '#8a73bd',
  '#55a6a6',
]

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const resolvedColors = computed(() =>
  colors.map((c) => {
    if (c.startsWith('var(')) {
      const varName = c.slice(4, -1)
      return getCssVar(varName) || c
    }
    return c
  }),
)

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
    itemStyle: { color: resolvedColors.value[index % resolvedColors.value.length] },
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
  if (!donutRef.value) return
  if (!chart) {
    chart = echarts.init(donutRef.value)
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
        <i :style="{ background: resolvedColors[index % resolvedColors.length] }" />
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
  display: grid;
  max-height: 154px;
  overflow-y: auto;
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
