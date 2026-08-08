<script setup lang="ts">
import BaseCard from './BaseCard.vue'
import MoneyText from './MoneyText.vue'
import type { LedgerListItem } from '@/db/repositories/dashboard-repository'

defineProps<{
  label: string
  incomeMinor: number
  expenseMinor: number
  items: readonly LedgerListItem[]
}>()

const emit = defineEmits<{
  select: [item: LedgerListItem]
}>()

function displayAmount(item: LedgerListItem): number {
  if (item.type === 'expense' || item.type === 'credit_purchase') {
    return -item.amountMinor
  }
  return item.amountMinor
}

function amountTone(item: LedgerListItem): 'default' | 'income' | 'expense' {
  if (item.type === 'income' || item.type === 'refund') return 'income'
  if (item.type === 'expense' || item.type === 'credit_purchase') return 'expense'
  return 'default'
}
</script>

<template>
  <BaseCard class="daily-card">
    <header class="daily-card__header">
      <strong>{{ label }}</strong>
      <span>
        <template v-if="incomeMinor">收 ¥{{ (incomeMinor / 100).toFixed(2) }}</template>
        <template v-if="incomeMinor && expenseMinor"> · </template>
        <template v-if="expenseMinor">支 ¥{{ (expenseMinor / 100).toFixed(2) }}</template>
      </span>
    </header>
    <div class="daily-card__list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="transaction-row"
        @click="emit('select', item)"
      >
        <span class="transaction-row__dot" :data-type="item.type" aria-hidden="true" />
        <div class="transaction-row__body">
          <strong>{{ item.title }}</strong>
          <span>{{ item.accountLabel }}</span>
        </div>
        <MoneyText
          class="transaction-row__amount"
          :amount-minor="displayAmount(item)"
          :tone="amountTone(item)"
          :show-plus="item.type === 'income' || item.type === 'refund'"
        />
      </button>
    </div>
  </BaseCard>
</template>

<style scoped>
.daily-card {
  padding: 0 var(--space-4);
}

.daily-card__header {
  display: flex;
  height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-divider);
}

.daily-card__header strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
  line-height: var(--type-section-title-line);
}

.daily-card__header span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.daily-card__list {
  display: grid;
}

.transaction-row {
  display: grid;
  min-height: 56px;
  padding: 0;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}

.transaction-row:first-child {
  border-top: 0;
}

.transaction-row:active {
  background: var(--color-primary-50);
}

.transaction-row__dot {
  width: 6px;
  height: 6px;
  background: var(--color-text-tertiary);
  border-radius: var(--radius-pill);
}

.transaction-row__dot[data-type='income'] {
  background: var(--color-income);
}

.transaction-row__dot[data-type='expense'],
.transaction-row__dot[data-type='credit_purchase'] {
  background: var(--color-expense);
}

.transaction-row__body {
  display: grid;
  min-width: 0;
}

.transaction-row__body strong {
  overflow: hidden;
  font-size: var(--type-list-primary-size);
  font-weight: 500;
  line-height: var(--type-list-primary-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transaction-row__body span {
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transaction-row__amount {
  font-size: var(--type-list-amount-size);
  font-weight: 500;
  line-height: var(--type-list-amount-line);
}
</style>
