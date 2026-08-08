<script setup lang="ts">
import { MoreHorizontal } from '@lucide/vue'
import { computed } from 'vue'

import BaseCard from './BaseCard.vue'
import type { RecentSummary } from '@/features/finance/finance-service'

const props = defineProps<{ summary: RecentSummary; displayType: 'expense' | 'income_expense' }>()
defineEmits<{ settings: [] }>()
const maxValue = computed(() =>
  Math.max(
    1,
    ...props.summary.points.flatMap((point) =>
      props.displayType === 'expense'
        ? [point.expenseMinor]
        : [point.expenseMinor, point.incomeMinor],
    ),
  ),
)
function height(value: number) {
  return `${Math.max(value ? 5 : 0, (value / maxValue.value) * 72)}px`
}
function dayLabel(date: string) {
  const value = new Date(`${date}T00:00:00`)
  if (props.summary.points.length <= 7) {
    return `周${['日', '一', '二', '三', '四', '五', '六'][value.getDay()]}`
  }
  return String(value.getDate())
}
</script>

<template>
  <BaseCard class="summary-card"
    ><header>
      <div>
        <strong>{{ summary.label }}</strong>
        <small>
          收入：{{ (summary.incomeMinor / 100).toFixed(2) }}，支出：{{
            (summary.expenseMinor / 100).toFixed(2)
          }}
        </small>
      </div>
      <button type="button" aria-label="设置最近汇总" @click="$emit('settings')">
        <MoreHorizontal :size="22" />
      </button>
    </header>
    <div class="chart">
      <div v-for="point in summary.points" :key="point.date" class="bar-group">
        <div class="bars">
          <i
            v-if="displayType === 'income_expense'"
            class="bar income"
            :style="{ height: height(point.incomeMinor) }"
          /><i class="bar expense" :style="{ height: height(point.expenseMinor) }" />
        </div>
        <small>{{ dayLabel(point.date) }}</small>
      </div>
    </div>
  </BaseCard>
</template>

<style scoped>
.summary-card {
  display: grid;
  padding: var(--space-3) var(--space-4);
  gap: var(--space-3);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
header strong {
  font-size: var(--type-section-title-size);
  font-weight: 700;
}
header > div {
  display: grid;
  gap: 1px;
}
header small {
  color: var(--color-text-tertiary);
  font-size: 12px;
  line-height: 18px;
}
header button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: var(--color-text-tertiary);
  background: transparent;
  border: 0;
}
.chart {
  display: flex;
  height: 96px;
  align-items: flex-end;
  justify-content: space-around;
  gap: 3px;
}
.bar-group {
  display: grid;
  height: 92px;
  min-width: 12px;
  align-items: end;
  justify-items: center;
  gap: 4px;
  flex: 1;
}
.bars {
  display: flex;
  height: 74px;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
}
.bar {
  display: block;
  width: 7px;
  min-height: 0;
  border-radius: 4px 4px 0 0;
}
.bar.income {
  background: var(--color-income);
}
.bar.expense {
  background: var(--color-expense);
}
.bar-group small {
  color: var(--color-text-tertiary);
  font-size: 10px;
}
</style>
