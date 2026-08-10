<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DatePicker as VantDatePicker, Popup } from 'vant'
import 'vant/es/date-picker/style'
import 'vant/es/popup/style'

import { useRoutePageActive } from '@/composables/routePageActivation'

const props = defineProps<{
  show: boolean
  initialDate?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  select: [date: string, label: string]
}>()

const pageActive = useRoutePageActive()
const now = new Date()
const minDate = new Date(now.getFullYear() - 5, 0, 1)
const maxDate = new Date(now.getFullYear() + 1, 11, 31)

const currentDate = ref<string[]>([
  String(now.getFullYear()),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
])

watch(
  () => props.initialDate,
  (val) => {
    if (!val) return
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      currentDate.value = [
        String(d.getFullYear()),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ]
    }
  },
  { immediate: true },
)

const popupShow = computed({
  get: () => props.show && pageActive.value,
  set: (val: boolean) => emit('update:show', val),
})

function setToday(): void {
  const d = new Date()
  currentDate.value = [
    String(d.getFullYear()),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ]
}

function setYesterday(): void {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  currentDate.value = [
    String(d.getFullYear()),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ]
}

function setDayBeforeYesterday(): void {
  const d = new Date()
  d.setDate(d.getDate() - 2)
  currentDate.value = [
    String(d.getFullYear()),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ]
}

function isSameDay(values: string[], d: Date): boolean {
  return (
    Number(values[0]) === d.getFullYear() &&
    Number(values[1]) === d.getMonth() + 1 &&
    Number(values[2]) === d.getDate()
  )
}

const isToday = computed(() => isSameDay(currentDate.value, now))

const isYesterday = computed(() => {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return isSameDay(currentDate.value, d)
})

const isDayBeforeYesterday = computed(() => {
  const d = new Date(now)
  d.setDate(d.getDate() - 2)
  return isSameDay(currentDate.value, d)
})

function onConfirm(): void {
  const [y, m, d] = currentDate.value
  const dateStr = `${y}-${m}-${d}T${now.toTimeString().slice(0, 8)}`
  const today = new Date()
  const picked = new Date(Number(y), Number(m) - 1, Number(d))
  const diffDays = Math.floor((today.getTime() - picked.getTime()) / (1000 * 60 * 60 * 24))
  let label: string
  if (diffDays === 0) label = '今天'
  else if (diffDays === 1) label = '昨天'
  else if (diffDays === 2) label = '前天'
  else label = `${Number(m)}月${Number(d)}日`
  emit('select', dateStr, label)
  emit('update:show', false)
}

function onCancel(): void {
  emit('update:show', false)
}
</script>

<template>
  <Popup
    v-model:show="popupShow"
    position="bottom"
    round
    :close-on-click-overlay="true"
  >
    <div class="date-picker">
      <div class="date-picker__quick">
        <button
          type="button"
          class="date-picker__quick-btn"
          :class="{ active: isToday }"
          @click="setToday"
        >
          今天
        </button>
        <button
          type="button"
          class="date-picker__quick-btn"
          :class="{ active: isYesterday }"
          @click="setYesterday"
        >
          昨天
        </button>
        <button
          type="button"
          class="date-picker__quick-btn"
          :class="{ active: isDayBeforeYesterday }"
          @click="setDayBeforeYesterday"
        >
          前天
        </button>
      </div>
      <VantDatePicker
        v-model="currentDate"
        :min-date="minDate"
        :max-date="maxDate"
        title="选择日期"
        @confirm="onConfirm"
        @cancel="onCancel"
      />
    </div>
  </Popup>
</template>

<style scoped>
.date-picker {
  padding-bottom: env(safe-area-inset-bottom);
}

.date-picker__quick {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) var(--space-2);
}

.date-picker__quick-btn {
  min-width: 56px;
  height: 36px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-background);
  border: 0;
  border-radius: 18px;
  transition: all 0.15s;
}

.date-picker__quick-btn.active {
  color: white;
  background: var(--color-primary-500);
}
</style>
