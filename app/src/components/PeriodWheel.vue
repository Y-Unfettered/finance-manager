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
    /** 有数据的最早年份（取自统计最早月份），用于生成连续年份区间 */
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

/** 粒度胶囊（PRD 需求二 5.2）："今年/去年/指定年份"统一收进年份滚轮 */
const CAPSULES: readonly { value: StatisticsRangePreset; label: string }[] = [
  { value: 'this_month', label: '本月' },
  { value: 'last_month', label: '上月' },
  { value: 'this_year', label: '全年' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自定义' },
]

const currentYear = new Date().getFullYear()

const years = computed(() => {
  // 至少铺满 6 年（今年-5 起，回测反馈：只有两项时滚轮太空）；
  // 有更早数据时从最早年份铺起；无数据年份保留（选中后显示空状态）
  const floor = Math.min(props.minYear ?? currentYear - 5, currentYear - 5)
  const start = Math.max(2000, Math.min(floor, currentYear))
  const list: number[] = []
  for (let y = start; y <= currentYear; y += 1) list.push(y)
  return list
})

const wheelEl = ref<HTMLElement>()
const wheelDimmed = computed(() => props.preset === 'all' || props.preset === 'custom')

let scrollDebounce = 0

function scrollToYear(target: number, smooth: boolean): void {
  const el = wheelEl.value
  if (!el) return
  const index = years.value.indexOf(target)
  const item = index >= 0 ? (el.children[index] as HTMLElement | undefined) : undefined
  if (!item) return
  const max = el.scrollWidth - el.clientWidth
  const left = Math.max(0, Math.min(item.offsetLeft + item.offsetWidth / 2 - el.clientWidth / 2, max))
  // 定位（非平滑）时必须绕过容器的 scroll-behavior:smooth：
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

watch(
  () => props.year,
  (year) => void nextTick(() => scrollToYear(year, false)),
)

// 年份列表变化（数据加载后最早年份变化）时重新居中
watch(years, () => {
  void nextTick(() => scrollToYear(props.year, false))
})

onMounted(() => {
  // 双 rAF 确保路由过渡/字体加载后布局稳定再定位
  void nextTick(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToYear(props.year, false)))
  })
})
</script>

<template>
  <div class="period-wheel-wrap">
    <div class="period-wheel__capsules" role="tablist" aria-label="统计粒度">
      <button
        v-for="capsule in CAPSULES"
        :key="capsule.value"
        type="button"
        role="tab"
        :aria-selected="preset === capsule.value"
        :class="{ active: preset === capsule.value }"
        @click="emit('update:preset', capsule.value)"
      >
        {{ capsule.label }}
      </button>
    </div>
    <div
      ref="wheelEl"
      class="period-wheel"
      :class="{ 'period-wheel--dim': wheelDimmed }"
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
    <span class="visually-hidden" aria-live="polite">已切换到 {{ year }} 年</span>
    <div v-if="preset === 'custom'" class="period-wheel__custom">
      <AppDateInput
        :model-value="startDate"
        label="开始日期"
        variant="compact"
        @update:model-value="emit('update:startDate', $event ?? '')"
      />
      <span>至</span>
      <AppDateInput
        :model-value="endDate"
        label="结束日期"
        variant="compact"
        @update:model-value="emit('update:endDate', $event ?? '')"
      />
    </div>
  </div>
</template>

<style scoped>
.period-wheel-wrap {
  display: grid;
  gap: var(--space-2);
}

.period-wheel__capsules {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
}

.period-wheel__capsules button {
  min-height: 32px;
  padding: 0 var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
}

.period-wheel__capsules button.active {
  color: var(--color-primary-600);
  font-weight: 600;
  background: var(--color-primary-50);
  border-color: var(--color-primary-200);
}

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
  border-radius: var(--radius-control);
  -webkit-mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
}

.period-wheel::-webkit-scrollbar {
  display: none;
}

.period-wheel--dim {
  opacity: 0.55;
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

.period-wheel__custom {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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
