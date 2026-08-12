<script setup lang="ts">
import { Search, X } from '@lucide/vue'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    maxlength?: number
  }>(),
  {
    modelValue: '',
    placeholder: '',
    maxlength: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const hasValue = computed(() => props.modelValue.length > 0)

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function onClear(): void {
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="search-input" :class="{ 'search-input--has-value': hasValue }">
    <Search :size="18" :stroke-width="2" class="search-input__icon" aria-hidden="true" />
    <input
      :value="modelValue"
      :maxlength="maxlength"
      :placeholder="placeholder"
      type="text"
      class="search-input__field"
      @input="onInput"
    />
    <button
      v-if="hasValue"
      type="button"
      class="search-input__clear"
      aria-label="清除"
      @click="onClear"
    >
      <X :size="16" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.search-input {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 var(--space-3);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  transition: border-color var(--motion-fast) var(--ease-standard);
}

.search-input:focus-within {
  border-color: var(--color-primary-500);
}

.search-input__icon {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  transition: color var(--motion-fast) var(--ease-standard);
}

.search-input:focus-within .search-input__icon {
  color: var(--color-primary-500);
}

.search-input__field {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
  outline: none;
}

.search-input__field::placeholder {
  color: var(--color-text-tertiary);
}

.search-input__clear {
  flex-shrink: 0;
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  place-items: center;
  color: var(--color-text-tertiary);
  background: transparent;
  border: 0;
  border-radius: 50%;
  transition: color var(--motion-fast) var(--ease-standard);
}

.search-input__clear:hover {
  color: var(--color-text-secondary);
}
</style>