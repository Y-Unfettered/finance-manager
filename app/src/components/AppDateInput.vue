<template>
  <div class="app-date-input" @click="open">
    <span class="app-date-input__label">
      <strong>{{ label }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
    <span class="app-date-input__value">
      <span class="app-date-input__value-text">{{ displayValue }}</span>
      <ChevronRight :size="18" :stroke-width="1.75" />
    </span>
    <DatePicker
      v-model:show="showPicker"
      :initial-date="modelValue ?? undefined"
      @select="onSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight } from '@lucide/vue'
import DatePicker from './DatePicker.vue'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  label?: string
  description?: string
  placeholder?: string
}>(), {
  label: '',
  description: '',
  placeholder: '选择日期'
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  change: [value: string | null]
}>()

const showPicker = ref(false)

const displayValue = computed(() => {
  if (!props.modelValue) return `< ${props.placeholder}`
  const d = new Date(props.modelValue)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})

function open() {
  showPicker.value = true
}

function onSelect(date: string) {
  emit('update:modelValue', date)
  emit('change', date)
}
</script>

<style scoped>
.app-date-input {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 68px;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-divider);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.app-date-input:first-child {
  border-top: none;
}

.app-date-input__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.app-date-input__label strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.35;
}

.app-date-input__label small {
  font-size: 13px;
  color: var(--color-text-2);
  line-height: 1.4;
}

.app-date-input__value {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-2);
  font-size: 15px;
}

.app-date-input__value-text {
  color: var(--color-primary-600);
  font-weight: 500;
  max-width: 180px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>