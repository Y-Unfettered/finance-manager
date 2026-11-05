<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DatePicker as VantDatePicker, TimePicker, Popup, Tabs, Tab } from 'vant'
import 'vant/es/date-picker/style'
import 'vant/es/time-picker/style'
import 'vant/es/popup/style'
import 'vant/es/tab/style'
import 'vant/es/tabs/style'

import { useRoutePageActive } from '@/composables/routePageActivation'

const props = defineProps<{
  show: boolean
  /** ISO 或 datetime-local 字符串，如 2026-11-05T14:30 */
  initialValue?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  /** 返回 datetime-local 格式：YYYY-MM-DDTHH:mm */
  select: [value: string]
}>()

const pageActive = useRoutePageActive()
const now = new Date()
const minDate = new Date(now.getFullYear() - 5, 0, 1)
const maxDate = new Date(now.getFullYear() + 1, 11, 31)

function splitInitial(val?: string): { date: string[]; time: string[] } {
  if (!val) return { date: [], time: [] }
  const d = new Date(val)
  if (isNaN(d.getTime())) return { date: [], time: [] }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: [String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate())],
    time: [pad(d.getHours()), pad(d.getMinutes())],
  }
}

const init = splitInitial(props.initialValue)
const currentDate = ref<string[]>(
  init.date.length
    ? init.date
    : [String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate())],
)
const currentTime = ref<string[]>(
  init.time.length ? init.time : [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')],
)

watch(
  () => props.initialValue,
  (val) => {
    const s = splitInitial(val)
    if (s.date.length) currentDate.value = s.date
    if (s.time.length) currentTime.value = s.time
  },
)

const popupShow = computed({
  get: () => props.show && pageActive.value,
  set: (val: boolean) => emit('update:show', val),
})

function onConfirm(): void {
  const [y, m, d] = currentDate.value
  const [hh, mm] = currentTime.value
  emit('select', `${y}-${m}-${d}T${hh}:${mm}`)
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
    teleport="body"
    :close-on-click-overlay="true"
  >
    <div class="datetime-picker">
      <Tabs shrink>
        <Tab title="日期">
          <VantDatePicker
            v-model="currentDate"
            :min-date="minDate"
            :max-date="maxDate"
            title="选择日期"
          />
        </Tab>
        <Tab title="时间">
          <TimePicker v-model="currentTime" title="选择时间" />
        </Tab>
      </Tabs>
      <div class="datetime-picker__actions">
        <button type="button" class="datetime-picker__btn" @click="onCancel">取消</button>
        <button type="button" class="datetime-picker__btn datetime-picker__btn--primary" @click="onConfirm">确定</button>
      </div>
    </div>
  </Popup>
</template>

<style scoped>
.datetime-picker__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px);
}
.datetime-picker__btn {
  min-height: 40px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-divider, #e5e7eb);
  background: transparent;
  color: var(--color-text-primary, #1f2329);
  font-size: 15px;
}
.datetime-picker__btn--primary {
  background: var(--color-primary, #176b5d);
  color: #fff;
  border-color: transparent;
}
</style>
