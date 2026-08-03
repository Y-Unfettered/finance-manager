<script setup lang="ts">
import { Popup } from 'vant'
import 'vant/es/popup/style'

defineProps<{
  show: boolean
  title: string
}>()

defineEmits<{
  'update:show': [value: boolean]
}>()
</script>

<template>
  <Popup
    :show="show"
    teleport="body"
    position="bottom"
    round
    closeable
    safe-area-inset-bottom
    class="app-bottom-sheet"
    @update:show="$emit('update:show', $event)"
  >
    <div class="app-bottom-sheet__header">
      <h2>{{ title }}</h2>
    </div>
    <div class="app-bottom-sheet__body">
      <slot />
    </div>
  </Popup>
</template>

<style scoped>
.app-bottom-sheet {
  min-height: 240px;
  color: var(--color-text-primary);
  background: var(--color-surface);
}

.app-bottom-sheet__header {
  display: flex;
  min-height: 56px;
  padding: 0 56px 0 var(--space-4);
  align-items: center;
  border-bottom: 1px solid var(--color-divider);
}

.app-bottom-sheet__header h2 {
  margin: 0;
  font-size: var(--type-section-title-size);
  font-weight: 600;
  line-height: var(--type-section-title-line);
}

.app-bottom-sheet__body {
  padding: var(--space-4);
}
</style>
