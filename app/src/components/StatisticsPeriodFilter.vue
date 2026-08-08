<script setup lang="ts">
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
</script>

<template>
  <div class="statistics-filter">
    <select
      :value="preset"
      aria-label="统计日期范围"
      @change="
        $emit('update:preset', ($event.target as HTMLSelectElement).value as StatisticsRangePreset)
      "
    >
      <option value="this_month">本月</option>
      <option value="last_month">上月</option>
      <option value="this_year">今年</option>
      <option value="last_year">去年</option>
      <option value="year">指定年份</option>
      <option value="all">全部</option>
      <option value="custom">自定义</option>
    </select>
    <input
      v-if="preset === 'year'"
      :value="year"
      type="number"
      min="1970"
      max="2200"
      aria-label="指定年份"
      @input="$emit('update:year', Number(($event.target as HTMLInputElement).value))"
    />
    <template v-if="preset === 'custom'">
      <input
        :value="startDate"
        type="date"
        aria-label="开始日期"
        @input="$emit('update:startDate', ($event.target as HTMLInputElement).value)"
      />
      <span>至</span>
      <input
        :value="endDate"
        type="date"
        aria-label="结束日期"
        @input="$emit('update:endDate', ($event.target as HTMLInputElement).value)"
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

.statistics-filter select,
.statistics-filter input {
  min-width: 112px;
  height: 36px;
  padding: 0 var(--space-2);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}

.statistics-filter span {
  color: var(--color-text-tertiary);
  white-space: nowrap;
}
</style>
