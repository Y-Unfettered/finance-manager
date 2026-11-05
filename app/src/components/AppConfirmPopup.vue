<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    /** danger：确认按钮红色（用于归档/停用等不可轻易撤销的动作） */
    danger?: boolean
    loading?: boolean
  }>(),
  {
    description: '',
    confirmText: '确定',
    cancelText: '取消',
    danger: false,
    loading: false,
  },
)

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: []
}>()

const visible = computed(() => props.show)
</script>

<template>
  <Teleport to="body">
    <Transition name="app-confirm">
      <div v-if="visible" class="app-confirm" @click.self="emit('update:show', false)">
        <div class="app-confirm__card" :class="{ 'app-confirm--danger': danger }" role="dialog" aria-modal="true" :aria-label="title">
          <div class="app-confirm__icon">
            <AlertTriangle :size="22" :stroke-width="1.75" aria-hidden="true" />
          </div>
          <h3 class="app-confirm__title">{{ title }}</h3>
          <p v-if="description" class="app-confirm__desc">{{ description }}</p>
          <div class="app-confirm__actions">
            <button type="button" class="app-confirm__btn" @click="emit('update:show', false)">
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="app-confirm__btn app-confirm__btn--primary"
              :class="{ 'app-confirm__btn--danger': danger }"
              :disabled="loading"
              @click="emit('confirm')"
            >
              {{ loading ? '处理中…' : confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-confirm {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(15, 23, 42, 0.45);
}

.app-confirm__card {
  width: 100%;
  max-width: 320px;
  padding: var(--space-5);
  text-align: center;
  background: var(--color-surface, #fff);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
}

.app-confirm__icon {
  display: grid;
  width: 44px;
  height: 44px;
  margin: 0 auto var(--space-3);
  place-items: center;
  color: var(--color-warning-600, #b7791f);
  background: var(--color-warning-50, #fef3c7);
  border-radius: 999px;
}

.app-confirm--danger .app-confirm__icon {
  color: var(--color-danger-600, #d45f5a);
  background: var(--color-danger-50, #fde8e7);
}

.app-confirm__title {
  margin: 0 0 var(--space-2);
  color: var(--color-text-primary, #1f2329);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
}

.app-confirm__desc {
  margin: 0 0 var(--space-4);
  color: var(--color-text-secondary, #4b5563);
  font-size: 14px;
  line-height: 1.5;
}

.app-confirm__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.app-confirm__btn {
  min-height: 42px;
  color: var(--color-text-primary, #1f2329);
  font-size: 15px;
  background: var(--color-background, #f5f6f8);
  border: 0;
  border-radius: 12px;
}

.app-confirm__btn--primary {
  color: #fff;
  background: var(--color-primary-600, #176b5d);
}

.app-confirm__btn--danger {
  background: var(--color-danger-600, #d45f5a);
}

.app-confirm-enter-active,
.app-confirm-leave-active {
  transition: opacity 0.18s ease;
}

.app-confirm-enter-from,
.app-confirm-leave-to {
  opacity: 0;
}
</style>