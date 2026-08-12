<script setup lang="ts">
import { Check } from '@lucide/vue'
import { nextTick, ref, watch } from 'vue'

export interface ListItem {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    show: boolean
    title?: string
    options: readonly ListItem[]
    modelValue?: string
    showCheckmark?: boolean
  }>(),
  {
    title: '请选择',
    modelValue: '',
    showCheckmark: true,
  },
)

const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:modelValue': [value: string]
  select: [item: ListItem]
}>()

const listRef = ref<HTMLElement | null>(null)

function select(item: ListItem): void {
  emit('update:modelValue', item.value)
  emit('select', item)
  emit('update:show', false)
}

function cancel(): void {
  emit('update:show', false)
}

watch(
  () => props.show,
  async (val) => {
    if (val && listRef.value) {
      await nextTick()
      listRef.value.scrollTo(0, 0)
    }
  },
)
</script>

<template>
  <div v-if="show" class="list-picker-sheet">
    <div class="list-picker-sheet__overlay" @click.self="cancel" />
    <div class="list-picker-sheet__body">
      <header class="list-picker-sheet__header">
        <button type="button" class="list-picker-sheet__cancel" @click="cancel">取消</button>
        <h2>{{ title }}</h2>
        <span class="list-picker-sheet__spacer" />
      </header>

      <ul ref="listRef" class="list-picker-sheet__list">
        <li
          v-for="item in options"
          :key="item.value"
          class="list-picker-sheet__item"
          :class="{ 'list-picker-sheet__item--selected': item.value === modelValue }"
          @click="select(item)"
        >
          <span class="list-picker-sheet__item-label">{{ item.label }}</span>
          <Check
            v-if="showCheckmark && item.value === modelValue"
            :size="18"
            :stroke-width="2.25"
            class="list-picker-sheet__check"
            aria-hidden="true"
          />
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.list-picker-sheet {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: flex-end;
}

.list-picker-sheet__overlay {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 40%);
  animation: fade-in var(--motion-fast) var(--ease-standard) forwards;
}

@keyframes fade-in {
  from { opacity: 0 }
  to { opacity: 1 }
}

.list-picker-sheet__body {
  position: relative;
  z-index: 1;
  width: 100%;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  animation: slide-up var(--motion-slow) var(--ease-emphasized) forwards;
}

@keyframes slide-up {
  from { transform: translateY(100%) }
  to { transform: translateY(0) }
}

.list-picker-sheet__header {
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: 0 var(--space-4);
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-divider);
}

.list-picker-sheet__cancel {
  padding: 4px var(--space-2);
  color: var(--color-primary-600);
  font-size: var(--type-body-size);
  font-weight: 500;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.list-picker-sheet__header h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  text-align: center;
  font-size: var(--type-section-title-size);
  font-weight: 600;
  color: var(--color-text-primary);
}

.list-picker-sheet__spacer {
  min-width: 36px;
}

.list-picker-sheet__list {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: var(--space-1) 0;
}

.list-picker-sheet__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 var(--space-4);
  gap: var(--space-3);
  color: var(--color-text-primary);
  font-size: var(--type-list-primary-size);
  line-height: var(--type-list-primary-line);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.list-picker-sheet__item:active {
  background: var(--color-background);
}

.list-picker-sheet__item--selected {
  color: var(--color-primary-600);
}

.list-picker-sheet__item-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-picker-sheet__check {
  flex-shrink: 0;
  color: var(--color-primary-600);
}
</style>