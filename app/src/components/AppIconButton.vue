<script setup lang="ts">
defineProps<{
  label: string
  variant?: 'default' | 'on-dark'
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    class="app-icon-button"
    :class="`app-icon-button--${variant ?? 'default'}`"
    type="button"
    :aria-label="label"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>

<style scoped>
.app-icon-button {
  display: inline-grid;
  width: var(--size-touch-target);
  height: var(--size-touch-target);
  padding: 0;
  place-items: center;
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  transition:
    color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    transform var(--motion-instant) var(--ease-standard);
}

.app-icon-button:active {
  background: rgb(23 107 93 / 8%);
  transform: scale(0.98);
}

.app-icon-button--on-dark {
  color: white;
}

.app-icon-button--on-dark:active {
  background: rgb(255 255 255 / 14%);
}

.app-icon-button:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}
</style>
