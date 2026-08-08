<script setup lang="ts">
import { computed, ref } from 'vue'
const props = defineProps<{
  points: readonly {
    periodKey: string
    incomeMinor?: number
    expenseMinor?: number
    inflowMinor?: number
    outflowMinor?: number
  }[]
}>()
const emit = defineEmits<{ select: [periodKey: string | undefined] }>()
const selected = ref<string>()
const max = computed(() =>
  Math.max(
    1,
    ...props.points.flatMap((p) => [
      p.incomeMinor ?? p.inflowMinor ?? 0,
      p.expenseMinor ?? p.outflowMinor ?? 0,
    ]),
  ),
)
function height(value: number) {
  return `${Math.max(value ? 4 : 0, (value / max.value) * 100)}px`
}
function select(periodKey: string) {
  selected.value = selected.value === periodKey ? undefined : periodKey
  emit('select', selected.value)
}
</script>
<template>
  <div class="monthly-chart">
    <button
      v-for="point in points"
      :key="point.periodKey"
      class="month"
      :class="{ active: selected === point.periodKey }"
      type="button"
      @click="select(point.periodKey)"
    >
      <span class="bars"
        ><i
          class="bar income"
          :style="{ height: height(point.incomeMinor ?? point.inflowMinor ?? 0) }" /><i
          class="bar expense"
          :style="{ height: height(point.expenseMinor ?? point.outflowMinor ?? 0) }" /></span
      ><small>{{ Number(point.periodKey.slice(5)) }}月</small>
    </button>
  </div>
</template>
<style scoped>
.monthly-chart {
  display: flex;
  height: 132px;
  align-items: flex-end;
  justify-content: space-around;
  gap: 4px;
  border-bottom: 1px solid var(--color-divider);
}
.month {
  display: grid;
  height: 126px;
  min-width: 14px;
  padding: 0;
  align-items: end;
  justify-items: center;
  gap: 5px;
  flex: 1;
  background: transparent;
  border: 0;
  border-radius: 6px;
}
.month.active {
  background: var(--color-primary-50);
}
.bars {
  display: flex;
  height: 104px;
  align-items: flex-end;
  gap: 2px;
}
.bar {
  display: block;
  width: 7px;
  border-radius: 4px 4px 0 0;
}
.income {
  background: var(--color-income);
}
.expense {
  background: var(--color-expense);
}
small {
  color: var(--color-text-tertiary);
  font-size: 9px;
  white-space: nowrap;
}
</style>
