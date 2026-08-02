<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'standard' | 'compact' | 'summary'
  }>(),
  {
    variant: 'standard',
  },
)
</script>

<template>
  <section class="base-card" :class="`base-card--${variant}`">
    <slot />
  </section>
</template>

<style scoped>
.base-card {
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-card);
}

.base-card--compact {
  min-height: 56px;
}

.base-card--summary {
  min-height: 104px;
  padding: var(--space-5);
}
</style>
