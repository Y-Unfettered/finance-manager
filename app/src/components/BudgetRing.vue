<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([GaugeChart, CanvasRenderer])

const props = defineProps<{
  remainingPercent: number
  overspent: boolean
  size?: number
  centerLabel: string
  centerValue: string
}>()

const ringRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildOption() {
  const color = props.overspent ? (getCssVar('--color-expense') || '#d45f5a') : (getCssVar('--color-primary-500') || '#248561')
  const trackColor = getCssVar('--color-primary-50') || '#e8f5f0'
  const percent = props.overspent ? 100 : props.remainingPercent

  return {
    series: [
      {
        type: 'gauge',
        center: ['50%', '50%'],
        radius: '100%',
        startAngle: 90,
        endAngle: -270,
        min: 0,
        max: 100,
        splitNumber: 1,
        progress: {
          show: true,
          width: 6,
          roundCap: true,
          itemStyle: { color },
        },
        axisLine: {
          lineStyle: {
            width: 6,
            color: [[1, trackColor]],
          },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        data: [{ value: percent }],
        title: { show: false },
        detail: { show: false },
      },
    ],
  }
}

function renderChart(): void {
  if (!ringRef.value) return
  if (!chart) {
    chart = echarts.init(ringRef.value)
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
  () => [props.remainingPercent, props.overspent, props.size],
  () => nextTick(renderChart),
)
</script>

<template>
  <div class="ring-wrapper" :style="{ width: `${size}px`, height: `${size}px` }">
    <div ref="ringRef" class="ring-chart" />
    <div class="ring-center">
      <small>{{ centerLabel }}</small>
      <b>{{ centerValue }}</b>
    </div>
  </div>
</template>

<style scoped>
.ring-wrapper {
  position: relative;
  display: grid;
  place-items: center;
}
.ring-chart {
  width: 100%;
  height: 100%;
}
.ring-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  align-content: center;
  text-align: center;
  pointer-events: none;
  line-height: 1.2;
}
.ring-center small {
  color: var(--color-text-tertiary);
  font-size: 10px;
  display: block;
  margin-bottom: 2px;
}
.ring-center b {
  font-weight: 700;
  font-size: 14px;
}
</style>
