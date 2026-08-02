<script setup lang="ts">
import { WalletCards } from '@lucide/vue'

withDefaults(
  defineProps<{
    label: string
    tone?: 'primary' | 'info' | 'warning'
    compact?: boolean
  }>(),
  {
    tone: 'primary',
    compact: false,
  },
)
</script>

<template>
  <span
    class="account-avatar"
    :class="[`account-avatar--${tone}`, { 'account-avatar--compact': compact }]"
    role="img"
    :aria-label="label"
  >
    <slot>
      <WalletCards :size="compact ? 20 : 24" :stroke-width="1.75" aria-hidden="true" />
    </slot>
  </span>
</template>

<style scoped>
.account-avatar {
  display: inline-grid;
  width: var(--size-account-avatar);
  height: var(--size-account-avatar);
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-primary-700);
  background: var(--color-primary-50);
  border-radius: var(--radius-control);
}

.account-avatar--compact {
  width: 32px;
  height: 32px;
  border-radius: 10px;
}

.account-avatar--info {
  color: var(--color-info);
  background: rgb(71 120 173 / 10%);
}

.account-avatar--warning {
  color: var(--color-warning);
  background: rgb(201 132 45 / 10%);
}
</style>
