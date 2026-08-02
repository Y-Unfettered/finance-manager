<script setup lang="ts">
import { Construction } from '@lucide/vue'

import AppTopBar from '@/components/AppTopBar.vue'

defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <main class="placeholder-page">
    <div class="placeholder-page__safe-top">
      <AppTopBar :title="title" :show-back="false" />
    </div>
    <div class="placeholder-page__content">
      <Construction :size="30" :stroke-width="1.5" aria-hidden="true" />
      <strong>正在规划</strong>
      <p>{{ description }}</p>
    </div>
  </main>
</template>

<style scoped>
.placeholder-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--size-bottom-nav) + env(safe-area-inset-bottom));
  background: var(--color-background);
}

.placeholder-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.placeholder-page__content {
  display: grid;
  min-height: 60dvh;
  padding: var(--space-8) var(--page-gutter);
  place-items: center;
  align-content: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  text-align: center;
}

.placeholder-page__content svg {
  color: var(--color-primary-500);
}

.placeholder-page__content strong {
  color: var(--color-text-primary);
  font-size: var(--type-section-title-size);
}

.placeholder-page__content p {
  max-width: 280px;
  margin: 0;
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}
</style>
