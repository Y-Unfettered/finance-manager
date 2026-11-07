<script setup lang="ts">
/**
 * ─────────────────────────────────────────────────────────────────
 *  支出分类·条形图（账户统计 / 分类统计共用）
 *  想调样式？改这个文件里的这几处（都有标注）：
 *   ① chartHeight      —— 每根柱子占的行高（现 22px/档），数值越大整块越高
 *   ② barMaxWidth      —— 柱子本身的粗细（现 10px）
 *   ③ .distribution-bars 的 padding「6px 0 2px」
 *                        上 6px = 分隔线→第一根柱子的距离
 *                        下 2px = 最后一根柱子→备注的距离（备注文字
 *                        自带约 2px 行距，所以视觉上上下≈相等）
 *   ④ .bars-caption    —— 备注文字样式
 *   ⑤ margin-top 8px   —— 整块与上方环形图的距离
 *  数据（几根柱、多长、什么颜色）来自 statistics-service 的
 *  buildDistribution()，本组件只负责画。
 * ─────────────────────────────────────────────────────────────────
 */
import { THEME_COLOR_FALLBACKS } from '@/design-system/color-fallbacks'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'

import { resolveCategoryColor } from '@/features/finance/category-color'
import { distributionColorAt } from '@/features/statistics/distribution-colors'

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
let chartEl: HTMLElement | null = null

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const sortedItems = computed(() =>
  [...props.items].sort((a, b) => Math.abs(b.amountMinor) - Math.abs(a.amountMinor)),
)

/** 画布高度随条目数自适应：每档约 22px（回测反馈：高度/间距缩短一半） */
const chartHeight = computed(() => Math.max(66, sortedItems.value.length * 22))

function buildOption() {
  const textColor = getCssVar('--color-text-secondary') || THEME_COLOR_FALLBACKS.textSecondary
  const tertiaryColor = getCssVar('--color-text-tertiary') || THEME_COLOR_FALLBACKS.textTertiary

  const names = sortedItems.value.map((item) => item.name)
  const values = sortedItems.value.map((item) => Number((item.amountMinor / 100).toFixed(2)))
  const maxVal = Math.max(1, ...values.map((v) => Math.abs(v)))

  return {
    // containLabel:true 给类目轴标签让位，否则标签画在画布外被裁掉（PRD BUG-03）
    grid: { left: 8, right: 64, top: 0, bottom: 0, containLabel: true }, // top/bottom 保持 0，行距统一由 chartHeight 控制
    xAxis: {
      type: 'value',
      show: false,
      min: 0,
      max: maxVal * 1.2,
      // 注意：父级 show:false 只是不画轴，containLabel 仍会按 axisLabel 的高度
      // （margin 8 + 12px 字 ≈ 20px）预留空间，而且这块空间只从 grid 底部扣掉，
      // 结果就是整块内容被顶上去、下面多出一大截。必须显式关掉 label 才真正归零。
      axisLabel: { show: false },
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
        data: sortedItems.value.map((item, index) => ({
          value: Number((item.amountMinor / 100).toFixed(2)),
          itemStyle: {
            color: item.isOther
              ? tertiaryColor
              : item.color
                ? resolveCategoryColor(item.color)
                : distributionColorAt(index),
            borderRadius: [0, 5, 5, 0],
          },
        })),
        barMaxWidth: 10, // ② 柱子粗细（px）
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
  const el = chartRef.value
  if (!el) return
  // 容器可能被 v-if 卸载后重建（如点击无数据年份时分布为空）：
  // 实例与元素不匹配时必须弃旧实例重新 init，否则 setOption 画在已分离的旧画布上，
  // 新容器永远空白（2026-11-07 回测：点年份滚轮后环/柱全部消失）
  if (!chart || chartEl !== el) {
    chart?.dispose()
    chart = echarts.init(el)
    chartEl = el
  }
  chart.setOption(buildOption(), true)
  // 高度随条目数变化后同步画布尺寸
  chart.resize()
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
  chartEl = null
})

watch(() => props.items, () => nextTick(renderChart), { deep: true })
</script>

<template>
  <div v-if="sortedItems.length" class="distribution-bars">
    <div ref="chartRef" class="bar-chart" :style="{ height: `${chartHeight}px` }" />
    <p class="bars-caption">支出 = 消费 − 退款，不含转账/还款</p>
  </div>
  <p v-else class="empty-hint">该区间无支出</p>
</template>

<style scoped>
.distribution-bars {
  width: 100%;
  /* ⑤ 与上方环形图的距离 */
  margin-top: var(--space-2);
  /* ③ 与分隔线的上下关系：padding 上 6px（线→首柱）、下 2px（末柱→备注，
     备注文字自带约 2px 行距，视觉上下≈相等）。想调就改这三个数 */
  padding: 6px 0 0px;
  border-top: 1px solid var(--color-divider);
  /* border-bottom: 1px solid var(--color-divider); */
}

.bar-chart {
  width: 100%;
  /* 高度完全由 chartHeight 内联控制（档数×22，无余量） */
  /* background-color: aqua; */
}

.empty-hint {
  color: var(--color-text-tertiary);
  text-align: center;
  padding: var(--space-3);
}

.bars-caption {
  margin: 0;
  padding: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
  /* background-color: aquamarine; */
}
</style>
