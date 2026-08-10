<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  percentage: number
  overspent?: boolean
}>()

const clampedPercent = computed(() => Math.max(0, Math.min(100, props.percentage)))

const barStyle = computed(() => {
  const overspent = props.overspent ?? false
  const width = overspent ? 100 : clampedPercent.value
  return {
    width: `${width}%`,
    background: overspent
      ? '#c0392b'
      : 'var(--color-primary-500, #248561)',
    borderRadius: '4px',
  }
})
</script>

<template>
  <div class="linear-progress-wrapper">
    <div class="linear-progress-bar" :style="barStyle" />
  </div>
</template>

<style scoped>
.linear-progress-wrapper {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--color-primary-50, #e8f5f0);
  overflow: hidden;
}
.linear-progress-bar {
  height: 100%;
  transition: width 0.3s ease;
}
</style>
