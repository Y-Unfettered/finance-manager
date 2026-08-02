<script setup lang="ts">
import { ArrowLeft, ChevronDown } from '@lucide/vue'

import AppIconButton from './AppIconButton.vue'

withDefaults(
  defineProps<{
    title: string
    showBack?: boolean
    periodSwitchable?: boolean
    variant?: 'surface' | 'transparent'
  }>(),
  {
    showBack: true,
    periodSwitchable: false,
    variant: 'surface',
  },
)

defineEmits<{
  back: []
  selectPeriod: []
}>()
</script>

<template>
  <header class="app-top-bar" :class="`app-top-bar--${variant}`">
    <div class="app-top-bar__slot">
      <slot name="left">
        <AppIconButton
          v-if="showBack"
          label="返回"
          :variant="variant === 'transparent' ? 'on-dark' : 'default'"
          @click="$emit('back')"
        >
          <ArrowLeft :size="24" :stroke-width="1.75" aria-hidden="true" />
        </AppIconButton>
      </slot>
    </div>

    <button
      class="app-top-bar__title"
      :class="{ 'app-top-bar__title--switchable': periodSwitchable }"
      type="button"
      :disabled="!periodSwitchable"
      @click="periodSwitchable && $emit('selectPeriod')"
    >
      <span>{{ title }}</span>
      <ChevronDown v-if="periodSwitchable" :size="16" :stroke-width="1.75" aria-hidden="true" />
    </button>

    <div class="app-top-bar__slot app-top-bar__slot--right">
      <slot name="right" />
    </div>
  </header>
</template>

<style scoped>
.app-top-bar {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 56px;
  align-items: center;
  width: 100%;
  height: var(--size-app-bar);
  color: var(--color-text-primary);
  background: var(--color-surface);
}

.app-top-bar--transparent {
  color: white;
  background: transparent;
}

.app-top-bar__slot {
  display: grid;
  place-items: center;
}

.app-top-bar__slot--right {
  justify-self: end;
}

.app-top-bar__title {
  display: inline-flex;
  min-width: 0;
  height: 32px;
  padding: 0 var(--space-2);
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  overflow: hidden;
  color: inherit;
  font-size: var(--type-appbar-title-size);
  font-weight: 600;
  line-height: var(--type-appbar-title-line);
  text-overflow: ellipsis;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
}

.app-top-bar__title--switchable:active {
  background: rgb(23 107 93 / 8%);
}

.app-top-bar--transparent .app-top-bar__title--switchable:active {
  background: rgb(255 255 255 / 14%);
}
</style>
