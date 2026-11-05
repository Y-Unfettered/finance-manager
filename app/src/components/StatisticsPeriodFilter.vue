<script setup lang="ts">
import AppSelect from './AppSelect.vue'
import AppDateInput from './AppDateInput.vue'

export type StatisticsRangePreset =
  'this_month' | 'last_month' | 'this_year' | 'last_year' | 'year' | 'all' | 'custom'

defineProps<{
  preset: StatisticsRangePreset
  year: number
  startDate: string
  endDate: string
}>()

defineEmits<{
  'update:preset': [value: StatisticsRangePreset]
  'update:year': [value: number]
  'update:startDate': [value: string]
  'update:endDate': [value: string]
}>()

const PRESET_OPTIONS = [
  { value: 'this_month', label: '本月' },
  { value: 'last_month', label: '上月' },
  { value: 'this_year', label: '今年' },
  { value: 'last_year', label: '去年' },
  { value: 'year', label: '指定年份' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自定义' },
]
</script>

<template>
  <div class="statistics-filter">
    <AppSelect
      :model-value="preset"
      :options="PRESET_OPTIONS"
      variant="inline"
      @update:model-value="$emit('update:preset', $event as StatisticsRangePreset)"
    />
    <label v-if="preset === 'year'" class="statistics-filter__field">
      <span>年份</span>
      <input
        :value="year"
        type="text"
        inputmode="numeric"
        placeholder="2026"
        @input="$emit('update:year', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <template v-if="preset === 'custom'">
      <AppDateInput
        :model-value="startDate"
        label="开始日期"
        variant="compact"
        @update:model-value="$emit('update:startDate', $event ?? '')"
      />
      <span>至</span>
      <AppDateInput
        :model-value="endDate"
        label="结束日期"
        variant="compact"
        @update:model-value="$emit('update:endDate', $event ?? '')"
      />
    </template>
  </div>
</template>

<style scoped>
.statistics-filter {
  display: flex;
  min-height: 44px;
  padding: var(--space-2);
  align-items: center;
  gap: var(--space-2);
  overflow-x: auto;
  background: var(--color-surface);
  border-radius: var(--radius-control);
}

.statistics-filter :deep(.app-select--inline .app-select__value) {
  min-width: 112px;
}

.statistics-filter__field {
  display: grid;
  min-width: 0;
  gap: 4px;
  align-content: start;
}

.statistics-filter__field > span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.statistics-filter__field input {
  min-width: 112px;
  height: 38px;
  padding: 0 var(--space-2);
  color: var(--color-text-primary);
  font-size: 13px;
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}

.statistics-filter > span {
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.statistics-filter :deep(.app-date-input--compact) {
  min-width: 0;
}

.statistics-filter :deep(.app-date-input--compact .app-date-input__value) {
  height: 38px;
}
</style>
