<script setup lang="ts">
import { Lock } from '@lucide/vue'
import { ref } from 'vue'

import PinPad from '@/components/PinPad.vue'
import { useAppLockService } from '@/features/app-lock/app-lock-service'
import { useAppLockStore } from '@/features/app-lock/app-lock-store'

const service = useAppLockService()
const store = useAppLockStore()

const pin = ref('')
const error = ref(false)
const resetTrigger = ref(0)

async function onComplete(value: string): Promise<void> {
  pin.value = value
  const ok = await service.verifyPin(value)
  if (ok) {
    error.value = false
    store.unlock()
  } else {
    error.value = true
    resetTrigger.value += 1
    pin.value = ''
  }
}
</script>

<template>
  <main class="unlock-page">
    <div class="unlock-page__safe-top" />
    <div class="unlock-page__content">
      <div class="unlock-page__header">
        <span class="unlock-page__icon">
          <Lock :size="32" :stroke-width="1.5" aria-hidden="true" />
        </span>
        <h1>输入 PIN 码解锁</h1>
        <p>请输入应用锁 PIN 码以查看你的账本</p>
      </div>
      <PinPad :length="4" :error="error" :reset-trigger="resetTrigger" @complete="onComplete" />
    </div>
  </main>
</template>

<style scoped>
.unlock-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.unlock-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
}
.unlock-page__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100dvh - env(safe-area-inset-top));
  padding: var(--space-6) var(--page-gutter);
  gap: var(--space-10);
}
.unlock-page__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}
.unlock-page__icon {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.unlock-page__header h1 {
  margin: 0;
  font-size: var(--type-title-size);
  font-weight: 600;
}
.unlock-page__header p {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
}
</style>
