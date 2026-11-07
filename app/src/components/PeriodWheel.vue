<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import AppDateInput from './AppDateInput.vue'

export type StatisticsRangePreset =
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'year'
  | 'all'
  | 'custom'

const props = withDefaults(
  defineProps<{
    preset: StatisticsRangePreset
    year: number
    startDate: string
    endDate: string
    /** 有数据的最早年份（取自统计最早月份），用于生成年份区间起点 */
    minYear?: number
  }>(),
  { minYear: undefined },
)

const emit = defineEmits<{
  'update:preset': [value: StatisticsRangePreset]
  'update:year': [value: number]
  'update:startDate': [value: string]
  'update:endDate': [value: string]
}>()

/**
 * 粒度分段控件（样式对齐资产趋势卡的 trend-tabs）：
 * 本月 / 上月 / 全年 / 全部 / 自定义，五段一个灰底胶囊槽。
 * 年份滚轮只在「全年」时出现（本月/上月取当下、全部=不限时间、自定义=选日期）。
 */
const CAPSULES: readonly { value: StatisticsRangePreset; label: string }[] = [
  { value: 'this_month', label: '本月' },
  { value: 'last_month', label: '上月' },
  { value: 'this_year', label: '全年' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自定义' },
]

const SEGMENT_INDEX: Record<StatisticsRangePreset, number> = {
  this_month: 0,
  last_month: 1,
  this_year: 2,
  last_year: 2,
  year: 2,
  all: 3,
  custom: 4,
}

const activeSegment = computed(() => SEGMENT_INDEX[props.preset] ?? 2)

const currentYear = new Date().getFullYear()
/** 选中年份后面至少保留的年份数（保证选「今年」时也居中，回测反馈 ①） */
const FUTURE_YEARS = 2

const years = computed(() => {
  const floor = Math.min(props.minYear ?? currentYear - 5, currentYear - 5)
  const start = Math.max(2000, Math.min(floor, currentYear))
  const end = currentYear + FUTURE_YEARS
  const list: number[] = []
  for (let y = start; y <= end; y += 1) list.push(y)
  return list
})

const wheelEl = ref<HTMLElement>()
/** 年份滚轮仅在「全年」粒度出现（回测反馈 ③） */
const showWheel = computed(() => props.preset === 'this_year' || props.preset === 'year')

let scrollDebounce = 0

function scrollToYear(target: number, smooth: boolean): void {
  const el = wheelEl.value
  if (!el) return
  const index = years.value.indexOf(target)
  const item = index >= 0 ? (el.children[index] as HTMLElement | undefined) : undefined
  if (!item) return
  const max = el.scrollWidth - el.clientWidth
  const left = Math.max(0, Math.min(item.offsetLeft + item.offsetWidth / 2 - el.clientWidth / 2, max))
  // 定位（非平滑）时绕过容器的 scroll-behavior:smooth：
  // 平滑动画会被路由过渡打断、停在半路（回测：选中年份未居中）
  const prev = el.style.scrollBehavior
  el.style.scrollBehavior = smooth ? 'smooth' : 'auto'
  el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' })
  el.style.scrollBehavior = prev
}

function onWheelScroll(): void {
  window.clearTimeout(scrollDebounce)
  scrollDebounce = window.setTimeout(() => {
    const el = wheelEl.value
    if (!el) return
    const center = el.scrollLeft + el.clientWidth / 2
    let nearest: number | undefined
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < el.children.length; i += 1) {
      const child = el.children[i] as HTMLElement
      const itemCenter = child.offsetLeft + child.offsetWidth / 2
      const distance = Math.abs(itemCenter - center)
      if (distance < best) {
        best = distance
        nearest = years.value[i]
      }
    }
    if (nearest !== undefined && nearest !== props.year) {
      emit('update:year', nearest)
      if (props.preset !== 'year') emit('update:preset', 'year')
    }
  }, 120)
}

function selectYear(target: number): void {
  scrollToYear(target, true)
  if (target !== props.year || props.preset !== 'year') {
    emit('update:year', target)
    if (props.preset !== 'year') emit('update:preset', 'year')
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    selectYear(Math.max(years.value[0] ?? props.year, props.year - 1))
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    selectYear(Math.min(years.value[years.value.length - 1] ?? props.year, props.year + 1))
  }
}

function centerCurrentYear(): void {
  void nextTick(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToYear(props.year, false)))
  })
}

function selectCapsule(value: StatisticsRangePreset): void {
  emit('update:preset', value)
}

watch(
  () => props.year,
  (year) => void nextTick(() => scrollToYear(year, false)),
)

// 年份列表变化（数据加载后最早年份变化）时重新居中
watch(years, () => {
  void nextTick(() => scrollToYear(props.year, false))
})

// 滚轮重新出现（切回「全年」）时重新居中
watch(showWheel, (visible) => {
  if (visible) centerCurrentYear()
})

onMounted(centerCurrentYear)
</script>

<template>
  <div class="period-wheel-wrap">
    <!-- 分段控件：灰底胶囊槽 + 白色选中滑块（样式对齐资产趋势卡） -->
    <div class="preset-tabs" role="tablist" aria-label="统计粒度">
      <button
        v-for="(capsule, index) in CAPSULES"
        :key="capsule.value"
        type="button"
        role="tab"
        :aria-selected="activeSegment === index"
        :class="{ active: activeSegment === index }"
        @click="selectCapsule(capsule.value)"
      >
        {{ capsule.label }}
      </button>
    </div>

    <!-- 年份滚轮：仅「全年」粒度出现；data-router-touch-ignore 防止横滑误触全局返回 -->
    <div
      v-if="showWheel"
      ref="wheelEl"
      class="period-wheel"
      data-router-touch-ignore
      role="listbox"
      aria-label="统计年份"
      tabindex="0"
      @scroll="onWheelScroll"
      @keydown="onKeydown"
    >
      <span
        v-for="y in years"
        :key="y"
        class="period-wheel__item"
        role="option"
        :aria-selected="y === year"
        :class="{ active: y === year }"
        @click="selectYear(y)"
      >
        {{ y }}
      </span>
    </div>
    <span v-if="showWheel" class="visually-hidden" aria-live="polite">已切换到 {{ year }} 年</span>

    <!-- 自定义日期区间：三栏（开始 | 至 | 结束），整体居中 -->
    <template v-if="preset === 'custom'">
      <div class="period-custom">
        <AppDateInput
          :model-value="startDate"
          label="开始日期"
          variant="compact"
          @update:model-value="emit('update:startDate', $event ?? '')"
        />
        <span class="period-custom__to">至</span>
        <AppDateInput
          :model-value="endDate"
          label="结束日期"
          variant="compact"
          @update:model-value="emit('update:endDate', $event ?? '')"
        />
      </div>
      <p v-if="!startDate || !endDate" class="period-custom__hint">请选择完整的起止日期</p>
    </template>
  </div>
</template>

<style scoped>
.period-wheel-wrap {
  display: grid;
  gap: var(--space-2);
}

/* 分段控件：灰底胶囊槽 + 白色选中块（对齐资产趋势卡 trend-tabs） */
.preset-tabs {
  display: grid;
  width: 100%;
  padding: 3px;
  grid-template-columns: repeat(5, 1fr);
  background: var(--color-background);
  border-radius: var(--radius-pill);
}

.preset-tabs button {
  height: 34px;
  padding: 0 var(--space-1);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  transition:
    color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}

.preset-tabs button.active {
  color: var(--color-text-primary);
  font-weight: 650;
  background: var(--color-surface);
  box-shadow: 0 1px 6px rgb(23 33 30 / 8%);
}

/* 年份滚轮（仅全年出现） */
.period-wheel {
  display: flex;
  height: 56px;
  align-items: center;
  overflow-x: auto;
  padding: 0 calc(50% - 36px);
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;
  background: var(--color-surface);
  border-radius: 12px;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
}

.period-wheel::-webkit-scrollbar {
  display: none;
}

.period-wheel__item {
  flex: none;
  width: 72px;
  color: var(--color-text-tertiary);
  font-size: 14px;
  text-align: center;
  scroll-snap-align: center;
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease-standard);
}

.period-wheel__item.active {
  color: var(--color-primary-600);
  font-size: 17px;
  font-weight: 600;
}

/* 自定义日期区间：三等分栏（开始 | 至 | 结束）。
   「至」在自己的栏内水平垂直居中——到左右两个日期框的距离由构造保证相等（回测反馈） */
.period-custom {
  display: flex;
  align-items: flex-end;
  background: var(--color-surface);
  border-radius: 12px;
  padding: 12px var(--space-3);
}

.period-custom :deep(.app-date-input) {
  flex: 1;
  min-width: 0;
}

.period-custom__to {
  /* 至不参与均分：两个日期框平分剩余宽度（各约 174px，足以容纳日期+箭头），
     「至」用左右内边距保持视觉居中——选中日期后值框变宽也不会溢出卡片（回测反馈） */
  flex: none;
  align-self: flex-end;
  display: flex;
  height: 44px;
  padding: 0 10px;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 15px;
  font-weight: 500;
}

.period-custom__hint {
  margin: 2px 0 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .period-wheel {
    scroll-behavior: auto;
  }
}
</style>
