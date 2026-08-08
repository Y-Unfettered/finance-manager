<script setup lang="ts">
import { MoreHorizontal } from '@lucide/vue'
import { computed } from 'vue'

import BaseCard from './BaseCard.vue'
import MoneyText from './MoneyText.vue'
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
  return ['日', '一', '二', '三', '四', '五', '六'][value.getDay()]
}
</script>

<template>
  <BaseCard class="summary-card"
    ><header>
      <strong>{{ summary.label }}</strong
      ><button type="button" aria-label="设置最近汇总" @click="$emit('settings')">
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
    <footer>
      <div><span>收入</span><MoneyText :amount-minor="summary.incomeMinor" tone="income" /></div>
      <div>
        <span>支出</span><MoneyText :amount-minor="summary.expenseMinor" tone="expense" />
      </div></footer
  ></BaseCard>
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
  border-bottom: 1px solid var(--color-divider);
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
  width: 5px;
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
  font-size: 9px;
}
footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
footer div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
footer span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
footer :deep(.money-text) {
  font-weight: 600;
}
</style>
