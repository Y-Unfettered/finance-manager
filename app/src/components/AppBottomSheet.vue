<script setup lang="ts">
import { X } from '@lucide/vue'
import { Popup } from 'vant'
import { computed } from 'vue'
import 'vant/es/popup/style'

import { useRoutePageActive } from '@/composables/routePageActivation'

const props = defineProps<{
  show: boolean
  title: string
}>()

const pageActive = useRoutePageActive()
const visible = computed(() => props.show && pageActive.value)

defineEmits<{
  'update:show': [value: boolean]
}>()
</script>

<template>
  <Popup
    :show="visible"
    teleport="body"
    position="bottom"
    round
    safe-area-inset-bottom
    class="app-bottom-sheet"
    @update:show="$emit('update:show', $event)"
  >
    <div class="app-bottom-sheet__header">
      <h2>{{ title }}</h2>
      <div class="app-bottom-sheet__actions">
        <slot name="actions" />
        <button
          type="button"
          class="app-bottom-sheet__close"
          aria-label="关闭"
          @click="$emit('update:show', false)"
        >
          <X :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
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
  padding: 0 10px 0 var(--space-4);
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-divider);
}

.app-bottom-sheet__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.app-bottom-sheet__actions :deep(button),
.app-bottom-sheet__close {
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  place-items: center;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: 50%;
}

.app-bottom-sheet__actions :deep(button:active),
.app-bottom-sheet__close:active {
  background: var(--color-background);
}

.app-bottom-sheet__actions :deep(button:disabled) {
  opacity: 0.32;
}

.app-bottom-sheet__actions :deep(button.detail-header-danger) {
  color: var(--color-danger);
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
