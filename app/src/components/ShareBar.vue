<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  percent: number
}>()

const clampedPercent = computed(() => Math.max(0, Math.min(100, props.percent)))

const barStyle = computed(() => ({
  width: `${clampedPercent.value}%`,
  background: 'var(--color-primary-500, #248561)',
  borderRadius: '4px 0 0 4px',
}))
</script>

<template>
  <div class="share-bar-wrapper">
    <div class="share-bar-fill" :style="barStyle" />
  </div>
</template>

<style scoped>
.share-bar-wrapper {
  width: 100%;
  height: 5px;
  margin-top: var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-warning, #f0a020);
  overflow: hidden;
}
.share-bar-fill {
  height: 100%;
  transition: width 0.3s ease;
}
</style>
