<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue'
import { computed, ref } from 'vue'

import AppBottomSheet from './AppBottomSheet.vue'

export interface FilterSelectOption {
  value: string
  label: string
  /** 可选分组标题，同组的选项在弹层里以小标题分隔 */
  group?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    options: readonly FilterSelectOption[]
    placeholder?: string
  }>(),
  {
    placeholder: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const show = ref(false)

const selectedLabel = computed(() => {
  const opt = props.options.find((o) => o.value === props.modelValue)
  return opt?.label ?? props.placeholder ?? props.label
})

const grouped = computed(() => {
  const map = new Map<string, FilterSelectOption[]>()
  for (const opt of props.options) {
    const key = opt.group ?? ''
    const list = map.get(key) ?? []
    list.push(opt)
    map.set(key, list)
  }
  return [...map.entries()]
})

function select(value: string): void {
  emit('update:modelValue', value)
  show.value = false
}
</script>

<template>
  <label class="filter-select">
    <span>{{ label }}</span>
    <button type="button" class="filter-select__trigger" @click="show = true">
      <span class="filter-select__value">{{ selectedLabel }}</span>
      <ChevronDown :size="14" :stroke-width="1.75" aria-hidden="true" />
    </button>

    <AppBottomSheet v-model:show="show" :title="label">
      <ul class="filter-select__list">
        <template v-for="[group, opts] in grouped" :key="group">
          <li v-if="group" class="filter-select__group-title">{{ group }}</li>
          <li
            v-for="opt in opts"
            :key="opt.value"
            class="filter-select__item"
            :class="{ 'filter-select__item--active': opt.value === modelValue }"
            @click="select(opt.value)"
          >
            <span class="filter-select__item-label">{{ opt.label }}</span>
            <Check
              v-if="opt.value === modelValue"
              :size="18"
              :stroke-width="2"
              aria-hidden="true"
            />
          </li>
        </template>
      </ul>
    </AppBottomSheet>
  </label>
</template>

<style scoped>
.filter-select {
  display: grid;
  min-width: 0;
  gap: 4px;
  align-content: start;
}
.filter-select > span {
  flex: none;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.filter-select__trigger {
  display: flex;
  min-width: 0;
  height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  color: var(--color-text-primary);
  font-size: 13px;
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  -webkit-tap-highlight-color: transparent;
}
.filter-select__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-select__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2) 0;
  display: grid;
  gap: 0;
  max-height: 60vh;
  overflow-y: auto;
}
.filter-select__group-title {
  padding: var(--space-2) var(--space-2) 4px;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.filter-select__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 52px;
  padding: var(--space-3) var(--space-2);
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  border-radius: var(--radius-control);
  cursor: pointer;
}
.filter-select__item--active {
  color: var(--color-primary-600);
  font-weight: 600;
  background: var(--color-primary-50);
}
.filter-select__item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>