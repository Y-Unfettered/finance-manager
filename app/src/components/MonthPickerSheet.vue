<script setup lang="ts">
import { DatePicker, type DatePickerColumnType } from 'vant'
import 'vant/es/date-picker/style'
import { ref, watch } from 'vue'

import AppBottomSheet from './AppBottomSheet.vue'

const props = defineProps<{
  show: boolean
  period: string
  title?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  select: [period: string]
}>()

const selected = ref<string[]>([])
const columnTypes: DatePickerColumnType[] = ['year', 'month']
const minDate = new Date(1970, 0, 1)
const maxDate = new Date(2200, 11, 1)

watch(
  () => [props.show, props.period] as const,
  () => {
    if (!props.show) return
    const [year, month] = props.period.split('-')
    selected.value = [year ?? String(new Date().getFullYear()), month ?? '01']
  },
  { immediate: true },
)

function confirm(): void {
  const [year, month] = selected.value
  if (!year || !month) return
  emit('select', `${year}-${month.padStart(2, '0')}`)
  emit('update:show', false)
}
</script>

<template>
  <AppBottomSheet
    :show="show"
    :title="title ?? '选择月份'"
    @update:show="$emit('update:show', $event)"
  >
    <DatePicker
      v-model="selected"
      :columns-type="columnTypes"
      :min-date="minDate"
      :max-date="maxDate"
      :show-toolbar="false"
    />
    <button class="month-picker-confirm" type="button" @click="confirm">确定</button>
  </AppBottomSheet>
</template>

<style scoped>
.month-picker-confirm {
  width: 100%;
  height: 46px;
  margin-top: 8px;
  color: white;
  font-size: 15px;
  font-weight: 650;
  background: var(--color-primary-600);
  border: 0;
  border-radius: 12px;
}
</style>
