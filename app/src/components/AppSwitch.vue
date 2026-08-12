<template>
  <div class="app-switch-row" :class="`app-switch-row--${variant}`" @click.stop="toggle">
    <span class="app-switch-row__label">
      <strong>{{ label }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
    <span
      class="app-switch"
      :class="{ 'app-switch--on': modelValue }"
      :aria-checked="modelValue ? 'true' : 'false'"
      role="switch"
      tabindex="0"
    >
      <span class="app-switch__slider" />
    </span>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  label?: string
  description?: string
  disabled?: boolean
  variant?: 'row' | 'inline'
}>(), {
  label: '',
  description: '',
  disabled: false,
  variant: 'row'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  change: [value: boolean]
}>()

function toggle() {
  if (props.disabled) return
  const next = !props.modelValue
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<style scoped>
.app-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-divider);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  min-height: 68px;
}

.app-switch-row:first-child {
  border-top: none;
}

.app-switch-row__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.app-switch-row__label strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.35;
}

.app-switch-row__label small {
  font-size: 13px;
  color: var(--color-text-2);
  line-height: 1.4;
}

.app-switch {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 28px;
  border-radius: 14px;
  background: var(--color-divider);
  transition: background-color 0.2s;
}

.app-switch--on {
  background: var(--color-primary-600);
}

.app-switch__slider {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
}

.app-switch--on .app-switch__slider {
  transform: translateX(20px);
}

.app-switch-row--inline {
  padding: 0;
  min-height: 40px;
  border-top: 0;
  gap: var(--space-2);
}
</style>