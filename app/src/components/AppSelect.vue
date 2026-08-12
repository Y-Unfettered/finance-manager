<script setup lang="ts">
import { Check, ChevronRight } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import AppBottomSheet from './AppBottomSheet.vue'
import { useRoutePageActive } from '@/composables/routePageActivation'

export interface AppSelectOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    description?: string
    options: readonly AppSelectOption[]
    placeholder?: string
  }>(),
  {
    modelValue: '',
    label: '',
    description: '',
    placeholder: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

const pageActive = useRoutePageActive()
const showSheet = ref(false)

watch(
  () => props.modelValue,
  () => {
    if (showSheet.value) showSheet.value = false
  },
)

const selectedLabel = computed(() => {
  const opt = props.options.find((o) => o.value === props.modelValue)
  return opt?.label ?? props.modelValue ?? props.placeholder
})

function select(value: string): void {
  emit('update:modelValue', value)
  showSheet.value = false
  emit('change', value)
}

function open(): void {
  showSheet.value = true
}

const sheetVisible = computed(() => showSheet.value && pageActive.value)
</script>

<template>
  <div class="app-select" @click="open">
    <span class="app-select__label">
      <strong>{{ label }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
    <span class="app-select__value">
      <span class="app-select__value-text">{{ selectedLabel }}</span>
      <ChevronRight :size="18" :stroke-width="1.75" aria-hidden="true" />
    </span>

    <AppBottomSheet v-model:show="showSheet" :title="label || '选择'">
      <ul v-if="sheetVisible" class="app-select__list">
        <li
          v-for="option in options"
          :key="option.value"
          class="app-select__item"
          :class="{ 'app-select__item--active': option.value === modelValue }"
          @click.stop="select(option.value)"
        >
          <span class="app-select__item-label">{{ option.label }}</span>
          <Check
            v-if="option.value === modelValue"
            :size="20"
            :stroke-width="2"
            aria-hidden="true"
          />
        </li>
      </ul>
    </AppBottomSheet>
  </div>
</template>

<style scoped>
.app-select {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  min-height: 68px;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-divider);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.app-select:first-child {
  border-top: 0;
}

.app-select__label {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.app-select__label strong {
  font-size: var(--type-list-primary-size);
  font-weight: 600;
  color: var(--color-text-primary);
}
.app-select__label small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.4;
}

.app-select__value {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  flex-shrink: 0;
}
.app-select__value-text {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2) 0;
  display: grid;
  gap: 0;
  max-height: 60vh;
  overflow-y: auto;
}

.app-select__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-3) var(--space-2);
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  border-radius: var(--radius-control);
  cursor: pointer;
}
.app-select__item--active {
  color: var(--color-primary-600);
  font-weight: 600;
  background: var(--color-primary-50);
}

.app-select__item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>