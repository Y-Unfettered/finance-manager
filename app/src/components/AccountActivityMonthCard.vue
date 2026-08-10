<script setup lang="ts">
import { Check } from '@lucide/vue'
import { onBeforeUnmount, ref } from 'vue'

import BaseCard from './BaseCard.vue'
import MoneyText from './MoneyText.vue'
import type { LedgerListItem } from '@/db/repositories/dashboard-repository'

interface AccountLedgerListItem extends LedgerListItem {
  dateLabel: string
  ledgerLabel: string
  displayAmountMinor: number
}

const props = withDefaults(
  defineProps<{
    label: string
    period: string
    inflowMinor: number
    outflowMinor: number
    items: readonly AccountLedgerListItem[]
    selectedIds?: readonly string[]
    selectionMode?: boolean
  }>(),
  { selectedIds: () => [], selectionMode: false },
)

const emit = defineEmits<{
  select: [item: AccountLedgerListItem]
  longpress: [item: AccountLedgerListItem]
  toggle: [item: AccountLedgerListItem]
}>()

let pressTimer: ReturnType<typeof setTimeout> | undefined
const longPressedId = ref<string>()

function startPress(item: AccountLedgerListItem): void {
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

function activate(item: AccountLedgerListItem): void {
  if (longPressedId.value === item.id) {
    longPressedId.value = undefined
    return
  }
  if (props.selectionMode) emit('toggle', item)
  else emit('select', item)
}

function formatMinor(amountMinor: number): string {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}

onBeforeUnmount(cancelPress)
</script>

<template>
  <BaseCard class="account-month-card">
    <header class="account-month-card__header">
      <div class="account-month-card__period">
        <strong>{{ label }}</strong>
        <span>{{ period }}</span>
      </div>
      <div class="account-month-card__summary">
        <span>流入：¥{{ formatMinor(inflowMinor) }}</span>
        <span>流出：¥{{ formatMinor(outflowMinor) }}</span>
      </div>
    </header>

    <div class="account-month-card__list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="account-activity-row"
        :class="{
          'account-activity-row--selection-mode': selectionMode,
          'account-activity-row--selected': selectedIds.includes(item.id),
        }"
        @pointerdown="startPress(item)"
        @pointerup="cancelPress"
        @pointerleave="cancelPress"
        @pointercancel="cancelPress"
        @contextmenu.prevent
        @click="activate(item)"
      >
        <span
          v-if="selectionMode"
          class="account-activity-row__check"
          :class="{ 'account-activity-row__check--active': selectedIds.includes(item.id) }"
          aria-hidden="true"
        >
          <Check v-if="selectedIds.includes(item.id)" :size="13" :stroke-width="3" />
        </span>
        <span
          v-else
          class="account-activity-row__dot"
          :data-direction="item.displayAmountMinor < 0 ? 'outflow' : 'inflow'"
          aria-hidden="true"
        />

        <div class="account-activity-row__body">
          <strong>{{ item.categoryLabel ?? item.title }}</strong>
          <span>{{ item.dateLabel }}</span>
          <small v-if="item.ledgerLabel">{{ item.ledgerLabel }}</small>
        </div>

        <div class="account-activity-row__right">
          <MoneyText
            :amount-minor="item.displayAmountMinor"
            :tone="item.displayAmountMinor < 0 ? 'expense' : 'default'"
            :show-currency="false"
          />
          <small>{{ item.accountLabel }}</small>
        </div>
      </button>
    </div>
  </BaseCard>
</template>

<style scoped>
.account-month-card {
  padding: 0 var(--space-4);
  overflow: hidden;
  border-color: rgb(231 235 232 / 55%);
}

.account-month-card__header {
  display: flex;
  min-height: 60px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-divider);
}

.account-month-card__period,
.account-month-card__summary {
  display: grid;
}

.account-month-card__period strong {
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
}

.account-month-card__period span,
.account-month-card__summary span {
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
}

.account-month-card__summary {
  justify-items: end;
}

.account-month-card__list {
  display: grid;
}

.account-activity-row {
  display: grid;
  min-height: 68px;
  padding: 6px 0;
  grid-template-columns: 5px minmax(0, 1fr) minmax(100px, auto);
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

.account-activity-row:first-child {
  border-top: 0;
}

.account-activity-row:active {
  opacity: 0.72;
  transform: scale(0.995);
}

.account-activity-row--selected {
  background: rgb(var(--color-primary-rgb) / 6%);
}

.account-activity-row--selection-mode {
  grid-template-columns: 18px minmax(0, 1fr) minmax(100px, auto);
  column-gap: var(--space-4);
}

.account-activity-row__check {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  color: white;
  border: 1.5px solid var(--color-text-tertiary);
  border-radius: 50%;
}

.account-activity-row__check--active {
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
}

.account-activity-row__dot {
  width: 4px;
  height: 4px;
  background: var(--color-text-primary);
  border-radius: var(--radius-pill);
}

.account-activity-row__dot[data-direction='outflow'] {
  background: var(--color-expense);
}

.account-activity-row__body,
.account-activity-row__right {
  display: grid;
  min-width: 0;
}

.account-activity-row__body strong {
  overflow: hidden;
  font-size: var(--type-list-primary-size);
  font-weight: 500;
  line-height: var(--type-list-primary-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-activity-row__body > span {
  color: var(--color-text-tertiary);
  font-size: 11px;
  line-height: 16px;
}

.account-activity-row__body > small {
  justify-self: start;
  padding: 0 3px;
  color: var(--color-text-tertiary);
  font-size: 10px;
  line-height: 15px;
  border: 1px solid var(--color-divider);
  border-radius: 3px;
}

.account-activity-row__right {
  justify-items: end;
  gap: 2px;
}

.account-activity-row__right :deep(.money-text) {
  font-size: var(--type-list-amount-size);
  font-weight: 500;
  line-height: var(--type-list-amount-line);
}

.account-activity-row__right small {
  overflow: hidden;
  max-width: 170px;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
