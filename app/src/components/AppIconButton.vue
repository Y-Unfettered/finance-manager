<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

defineProps<{
  label: string
  variant?: 'default' | 'on-dark'
}>()

const emit = defineEmits<{
  click: []
}>()

const showHint = ref(false)
const longPressed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function startPress(): void {
  longPressed.value = false
  timer = setTimeout(() => {
    longPressed.value = true
    showHint.value = true
  }, 430)
}

function endPress(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (showHint.value) setTimeout(() => (showHint.value = false), 650)
}

function handleClick(): void {
  if (longPressed.value) {
    longPressed.value = false
    return
  }
  emit('click')
}

onBeforeUnmount(() => timer && clearTimeout(timer))
</script>

<template>
  <button
    class="app-icon-button"
    :class="`app-icon-button--${variant ?? 'default'}`"
    type="button"
    :aria-label="label"
    @pointerdown="startPress"
    @pointerup="endPress"
    @pointercancel="endPress"
    @pointerleave="endPress"
    @contextmenu.prevent
    @click="handleClick"
  >
    <slot />
    <span v-if="showHint" class="app-icon-button__hint" role="tooltip">{{ label }}</span>
  </button>
</template>

<style scoped>
.app-icon-button {
  position: relative;
  display: inline-grid;
  width: 44px;
  height: 44px;
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

.app-icon-button::before {
  position: absolute;
  width: 32px;
  height: 32px;
  content: '';
  background: rgb(var(--color-primary-rgb) / 10%);
  border-radius: 50%;
  opacity: 0;
  transform: scale(0.72);
  transition:
    opacity var(--motion-instant),
    transform var(--motion-instant);
}

.app-icon-button > :not(.app-icon-button__hint) {
  position: relative;
  z-index: 1;
}

.app-icon-button:active {
  transform: scale(0.98);
}

.app-icon-button:active::before {
  opacity: 1;
  transform: scale(1);
}

.app-icon-button--on-dark {
  color: white;
}

.app-icon-button--on-dark::before {
  background: rgb(255 255 255 / 18%);
}

.app-icon-button:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}

.app-icon-button__hint {
  position: absolute;
  z-index: 80;
  top: calc(100% + 4px);
  left: 50%;
  padding: 5px 9px;
  color: white;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  background: rgb(20 22 21 / 92%);
  border-radius: 7px;
  box-shadow: 0 3px 10px rgb(0 0 0 / 16%);
  transform: translateX(-50%);
}
</style>
