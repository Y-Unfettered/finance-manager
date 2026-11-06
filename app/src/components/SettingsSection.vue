<script setup lang="ts">
defineProps<{
  /** 区块标题 */
  title: string
}>()
</script>

<template>
  <section class="settings-section">
    <h2>{{ title }}</h2>
    <div class="settings-section__stack">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-section h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

/* 区块内卡片栈：固定 12px 间距，页面不得再手写 margin-top 补间距（PRD BUG-05） */
.settings-section__stack {
  display: grid;
  gap: var(--space-3);
}
</style>
