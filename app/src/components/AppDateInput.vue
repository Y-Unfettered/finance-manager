<template>
  <div
    class="app-date-input"
    :class="'app-date-input--' + variant"
    @click="open"
  >
    <span class="app-date-input__label">
      <strong>{{ label }}</strong>
      <small v-if="description">{{ description }}</small>
    </span>
    <span class="app-date-input__value">
      <span class="app-date-input__value-text">{{ displayValue }}</span>
      <ChevronRight :size="18" :stroke-width="1.75" />
    </span>
    <DateTimePicker
      v-model:show="pickerShowModel"
      :initial-value="modelValue ?? undefined"
      @select="onSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from '@lucide/vue'
import DateTimePicker from './DateTimePicker.vue'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  label?: string
  description?: string
  placeholder?: string
  /** 是否含时间选择（datetime 场景），默认仅日期 */
  time?: boolean
  /** list：分隔线大行；compact：表单内边框紧凑触发器 */
  variant?: 'list' | 'compact'
}>(), {
  label: '',
  description: '',
  placeholder: '选择日期',
  time: false,
  variant: 'list',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  change: [value: string | null]
}>()

/** 受控弹层开关：父组件可 v-model:picker-show 控制；未绑定时走内部状态 */
const innerShow = defineModel<boolean>('pickerShow', { default: false })
const pickerShowModel = computed({
  get: () => innerShow.value,
  set: (v: boolean) => { innerShow.value = v },
})

const displayValue = computed(() => {
  if (!props.modelValue) return `< ${props.placeholder}`
  const d = new Date(props.modelValue)
  if (isNaN(d.getTime())) return props.modelValue
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (props.time) return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return date
})

function open() {
  pickerShowModel.value = true
}

function onSelect(value: string) {
  emit('update:modelValue', value)
  emit('change', value)
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

.app-date-input--compact {
  display: grid;
  gap: 6px;
  min-height: 0;
  padding: 0;
  border-top: 0;
}
.app-date-input--compact .app-date-input__label {
  gap: 0;
}
.app-date-input--compact .app-date-input__label strong {
  font-size: var(--type-caption-size);
  font-weight: 500;
  color: var(--color-text-secondary);
}
.app-date-input--compact .app-date-input__label small {
  display: none;
}
.app-date-input--compact .app-date-input__value {
  height: 44px;
  justify-content: space-between;
  padding: 0 var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.app-date-input--compact .app-date-input__value-text {
  font-weight: 500;
  max-width: none;
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