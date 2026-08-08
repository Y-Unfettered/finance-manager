<script setup lang="ts">
import { Delete } from '@lucide/vue'
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 期望输入几位 */
    length?: number
    /** 验证失败时震动并清空 */
    error?: boolean
    /** 自动验证后清空 */
    resetTrigger?: number
  }>(),
  { length: 4, error: false, resetTrigger: 0 },
)

const emit = defineEmits<{
  complete: [pin: string]
  change: [pin: string]
}>()

const input = ref('')

function push(digit: string): void {
  if (input.value.length >= props.length) return
  input.value += digit
  emit('change', input.value)
  if (input.value.length === props.length) {
    emit('complete', input.value)
  }
}

function pop(): void {
  if (input.value.length === 0) return
  input.value = input.value.slice(0, -1)
  emit('change', input.value)
}

// 外部触发重置（验证失败后清空）
watch(
  () => props.resetTrigger,
  () => {
    input.value = ''
  },
)

// error 变化时也清空
watch(
  () => props.error,
  (val) => {
    if (val) input.value = ''
  },
)

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
</script>

<template>
  <div class="pin-pad">
    <div class="pin-pad__dots" :class="{ 'pin-pad__dots--error': error }">
      <span
        v-for="i in length"
        :key="i"
        class="pin-dot"
        :class="{ 'pin-dot--filled': input.length >= i }"
      />
    </div>
    <p v-if="error" class="pin-pad__error">PIN 码错误，请重试</p>
    <div class="pin-pad__keys">
      <button
        v-for="(key, index) in keys"
        :key="index"
        type="button"
        class="pin-key"
        :class="{ 'pin-key--empty': key === '', 'pin-key--del': key === 'del' }"
        :disabled="key === ''"
        @click="key === 'del' ? pop() : push(key)"
      >
        <Delete v-if="key === 'del'" :size="24" :stroke-width="1.75" aria-hidden="true" />
        <span v-else>{{ key }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pin-pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
}
.pin-pad__dots {
  display: flex;
  gap: var(--space-3);
  transition: transform 0.2s;
}
.pin-pad__dots--error {
  animation: shake 0.4s;
}
.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--color-text-secondary);
  transition: all 0.15s;
}
.pin-dot--filled {
  background: var(--color-primary-600);
  border-color: var(--color-primary-600);
}
.pin-pad__error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--type-caption-size);
  min-height: 1.2em;
}
.pin-pad__keys {
  display: grid;
  grid-template-columns: repeat(3, 72px);
  gap: var(--space-3);
}
.pin-key {
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  font-size: 28px;
  font-weight: 500;
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-lg);
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.pin-key:active:not(:disabled) {
  background: var(--color-background);
}
.pin-key--empty {
  visibility: hidden;
}
.pin-key--del {
  color: var(--color-text-secondary);
}
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-8px);
  }
  75% {
    transform: translateX(8px);
  }
}
</style>
