<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    amountMinor: number
    currency?: string
    tone?: 'default' | 'income' | 'expense'
    showPlus?: boolean
  }>(),
  {
    currency: 'CNY',
    tone: 'default',
    showPlus: false,
  },
)

const formatted = computed(() => {
  const value = props.amountMinor / 100
  const prefix = props.showPlus && value > 0 ? '+' : ''
  const formattedValue = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: props.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

  return `${prefix}${formattedValue}`
})
</script>

<template>
  <span class="money-text" :class="`money-text--${tone}`">{{ formatted }}</span>
</template>

<style scoped>
.money-text {
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums lining-nums;
  white-space: nowrap;
}

.money-text--income {
  color: var(--color-income);
}

.money-text--expense {
  color: var(--color-expense);
}
</style>
