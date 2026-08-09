<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useRoutePageActive } from '@/composables/routePageActivation'

const props = defineProps<{
  show: boolean
  initialDate?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  select: [date: string, label: string]
}>()

const now = new Date()
const pageActive = useRoutePageActive()
const currentYear = now.getFullYear()

const years = computed(() => {
  const arr: number[] = []
  for (let y = currentYear - 5; y <= currentYear + 1; y++) arr.push(y)
  return arr
})

const months = computed(() => Array.from({ length: 12 }, (_, i) => i + 1))

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

const days = computed(() => {
  const dim = getDaysInMonth(selectedYear.value, selectedMonth.value)
  return Array.from({ length: dim }, (_, i) => i + 1)
})

const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)
const selectedDay = ref(now.getDate())

watch(
  () => props.initialDate,
  (val) => {
    if (!val) return
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      selectedYear.value = d.getFullYear()
      selectedMonth.value = d.getMonth() + 1
      selectedDay.value = d.getDate()
    }
  },
  { immediate: true },
)

watch(selectedMonth, () => {
  const dim = getDaysInMonth(selectedYear.value, selectedMonth.value)
  if (selectedDay.value > dim) selectedDay.value = dim
})

function setToday(): void {
  const d = new Date()
  selectedYear.value = d.getFullYear()
  selectedMonth.value = d.getMonth() + 1
  selectedDay.value = d.getDate()
}

function setYesterday(): void {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  selectedYear.value = d.getFullYear()
  selectedMonth.value = d.getMonth() + 1
  selectedDay.value = d.getDate()
}

function setDayBeforeYesterday(): void {
  const d = new Date()
  d.setDate(d.getDate() - 2)
  selectedYear.value = d.getFullYear()
  selectedMonth.value = d.getMonth() + 1
  selectedDay.value = d.getDate()
}

function confirm(): void {
  const dateStr = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-${String(selectedDay.value).padStart(2, '0')}T${now.toTimeString().slice(0, 8)}`
  const today = new Date()
  const picked = new Date(selectedYear.value, selectedMonth.value - 1, selectedDay.value)
  const diffDays = Math.floor((today.getTime() - picked.getTime()) / (1000 * 60 * 60 * 24))
  let label: string
  if (diffDays === 0) label = '今天'
  else if (diffDays === 1) label = '昨天'
  else if (diffDays === 2) label = '前天'
  else label = `${selectedMonth.value}月${selectedDay.value}日`
  emit('select', dateStr, label)
  emit('update:show', false)
}

function cancel(): void {
  emit('update:show', false)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show && pageActive" class="date-picker__overlay" @click.self="cancel">
      <div class="date-picker">
        <header class="date-picker__header">
          <button type="button" class="date-picker__btn date-picker__btn--cancel" @click="cancel">
            取消
          </button>
          <h2>选择日期</h2>
          <button type="button" class="date-picker__btn date-picker__btn--confirm" @click="confirm">
            确定
          </button>
        </header>

        <div class="date-picker__wheels">
          <div class="date-picker__wheel">
            <div class="date-picker__wheel-indicator"></div>
            <div class="date-picker__wheel-label">年</div>
            <select v-model="selectedYear" class="date-picker__select">
              <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
            </select>
          </div>
          <div class="date-picker__wheel">
            <div class="date-picker__wheel-indicator"></div>
            <div class="date-picker__wheel-label">月</div>
            <select v-model="selectedMonth" class="date-picker__select">
              <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="date-picker__wheel">
            <div class="date-picker__wheel-indicator"></div>
            <div class="date-picker__wheel-label">日</div>
            <select v-model="selectedDay" class="date-picker__select">
              <option v-for="d in days" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
        </div>

        <div class="date-picker__quick">
          <button
            type="button"
            class="date-picker__quick-btn"
            :class="{
              active:
                selectedYear === now.getFullYear() &&
                selectedMonth === now.getMonth() + 1 &&
                selectedDay === now.getDate(),
            }"
            @click="setToday"
          >
            今
          </button>
          <button type="button" class="date-picker__quick-btn" @click="setYesterday">昨</button>
          <button type="button" class="date-picker__quick-btn" @click="setDayBeforeYesterday">
            前
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.date-picker__overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 45%);
}

.date-picker {
  width: 100%;
  background: var(--color-surface);
  border-radius: 20px 20px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}

.date-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-divider);
}

.date-picker__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.date-picker__btn {
  padding: var(--space-2) var(--space-3);
  font-size: 15px;
  background: transparent;
  border: 0;
  border-radius: 8px;
}

.date-picker__btn--cancel {
  color: var(--color-text-tertiary);
}

.date-picker__btn--confirm {
  color: var(--color-primary-600);
  font-weight: 600;
}

.date-picker__wheels {
  display: flex;
  padding: var(--space-4);
  gap: var(--space-3);
}

.date-picker__wheel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.date-picker__wheel-indicator {
  height: 48px;
}

.date-picker__wheel-label {
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.date-picker__select {
  width: 100%;
  padding: 8px 12px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  text-align: center;
  background: var(--color-background);
  border: 0;
  border-radius: 10px;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  cursor: pointer;
}

.date-picker__quick {
  display: flex;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4) var(--space-4);
}

.date-picker__quick-btn {
  min-width: 52px;
  height: 44px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-background);
  border: 0;
  border-radius: 22px;
  transition: all 0.15s;
}

.date-picker__quick-btn.active {
  color: white;
  background: var(--color-primary-500);
}
</style>
