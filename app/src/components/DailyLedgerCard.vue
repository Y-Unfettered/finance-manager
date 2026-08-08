<script setup lang="ts">
import { Check } from '@lucide/vue'
import { onBeforeUnmount, ref } from 'vue'

import BaseCard from './BaseCard.vue'
import MoneyText from './MoneyText.vue'
import type { LedgerListItem } from '@/db/repositories/dashboard-repository'

const props = withDefaults(
  defineProps<{
    label: string
    incomeMinor: number
    expenseMinor: number
    items: readonly LedgerListItem[]
    selectedIds?: readonly string[]
    selectionMode?: boolean
  }>(),
  { selectedIds: () => [], selectionMode: false },
)

const emit = defineEmits<{
  select: [item: LedgerListItem]
  longpress: [item: LedgerListItem]
  toggle: [item: LedgerListItem]
}>()

let pressTimer: ReturnType<typeof setTimeout> | undefined
const longPressedId = ref<string>()

function startPress(item: LedgerListItem): void {
  cancelPress()
  pressTimer = setTimeout(() => {
    longPressedId.value = item.id
    emit('longpress', item)
  }, 460)
}

function cancelPress(): void {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = undefined
}

function activate(item: LedgerListItem): void {
  if (longPressedId.value === item.id) {
    longPressedId.value = undefined
    return
  }
  if (props.selectionMode) emit('toggle', item)
  else emit('select', item)
}

onBeforeUnmount(cancelPress)

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
        :class="{ 'transaction-row--selected': selectedIds.includes(item.id) }"
        @pointerdown="startPress(item)"
        @pointerup="cancelPress"
        @pointerleave="cancelPress"
        @pointercancel="cancelPress"
        @contextmenu.prevent
        @click="activate(item)"
      >
        <span
          v-if="selectionMode"
          class="transaction-row__check"
          :class="{ 'transaction-row__check--active': selectedIds.includes(item.id) }"
          aria-hidden="true"
        >
          <Check v-if="selectedIds.includes(item.id)" :size="13" :stroke-width="3" />
        </span>
        <span v-else class="transaction-row__dot" :data-type="item.type" aria-hidden="true" />
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
  overflow: hidden;
  border-color: rgb(231 235 232 / 55%);
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
  color: var(--color-text-primary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
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
  border-top: 1px solid rgb(231 235 232 / 62%);
  transition:
    opacity var(--motion-instant),
    transform var(--motion-instant);
}

.transaction-row:first-child {
  border-top: 0;
}

.transaction-row:active {
  opacity: 0.72;
  transform: scale(0.995);
}

.transaction-row--selected {
  background: rgb(23 107 93 / 6%);
}

.transaction-row__check {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  color: white;
  border: 1.5px solid var(--color-text-tertiary);
  border-radius: 50%;
}

.transaction-row__check--active {
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
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
