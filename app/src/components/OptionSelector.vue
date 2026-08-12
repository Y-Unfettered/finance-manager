<script setup lang="ts">
export interface OptionItem {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    options: readonly OptionItem[]
    modelValue?: string
    placeholder?: string
  }>(),
  {
    modelValue: '',
    placeholder: '请选择',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function select(value: string): void {
  emit('update:modelValue', value)
}

function isSelected(value: string): boolean {
  return props.modelValue === value
}
</script>

<template>
  <div class="option-selector" :class="{ 'option-selector--selected': modelValue }">
    <button
      type="button"
      class="option-selector__btn option-selector__btn--all"
      :class="{ 'option-selector__btn--active': !modelValue }"
      @click="select('')"
    >
      {{ placeholder }}
    </button>
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="option-selector__btn"
      :class="{ 'option-selector__btn--active': isSelected(opt.value) }"
      @click="select(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.option-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.option-selector__btn {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 14px;
  font-size: var(--type-label-size);
  line-height: var(--type-label-line);
  color: var(--color-text-secondary);
  background: var(--color-background);
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard);
  -webkit-tap-highlight-color: transparent;
}

.option-selector__btn--all {
  color: var(--color-text-tertiary);
  background: transparent;
  border: 1px dashed var(--color-divider);
}

.option-selector__btn:active {
  transform: scale(0.96);
}

.option-selector__btn--active {
  color: white;
  background: var(--color-primary-600);
}
</style>