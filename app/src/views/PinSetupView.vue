<script setup lang="ts">
import { Lock } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import PinPad from '@/components/PinPad.vue'
import { useAppLockService } from '@/features/app-lock/app-lock-service'
import { useAppLockStore } from '@/features/app-lock/app-lock-store'

type Phase = 'enter' | 'confirm' | 'old' | 'menu'

const router = useRouter()
const service = useAppLockService()
const store = useAppLockStore()

const phase = ref<Phase>('menu')
const firstPin = ref('')
const oldPin = ref('')
const error = ref('')
const resetTrigger = ref(0)
const loading = ref(false)

// 直接读取 store 响应式状态（App.vue 启动时已 load 过）
const isEnabled = computed(() => store.enabled)
const hasPin = computed(() => store.hasPin)

async function onComplete(value: string): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (phase.value === 'enter') {
      firstPin.value = value
      phase.value = 'confirm'
      resetTrigger.value += 1
    } else if (phase.value === 'confirm') {
      if (value !== firstPin.value) {
        error.value = '两次输入不一致，请重新设置'
        resetTrigger.value += 1
        firstPin.value = ''
        phase.value = 'enter'
      } else {
        await service.setupPin(value)
        store.applyState({ enabled: true, hasPin: true })
        firstPin.value = ''
        phase.value = 'menu'
      }
    } else if (phase.value === 'old') {
      const ok = await service.verifyPin(value)
      if (!ok) {
        error.value = '旧 PIN 码错误'
        resetTrigger.value += 1
      } else {
        oldPin.value = value
        phase.value = 'enter'
        resetTrigger.value += 1
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    resetTrigger.value += 1
    firstPin.value = ''
    phase.value = hasPin.value ? 'old' : 'enter'
  } finally {
    loading.value = false
  }
}

function startSetup(): void {
  error.value = ''
  firstPin.value = ''
  phase.value = hasPin.value ? 'old' : 'enter'
}

function startChange(): void {
  startSetup()
}

async function disable(): Promise<void> {
  loading.value = true
  try {
    await service.disable()
    store.applyState({ enabled: false, hasPin: false })
  } finally {
    loading.value = false
  }
}

async function toggleEnabled(): Promise<void> {
  loading.value = true
  try {
    if (isEnabled.value) {
      await service.setEnabled(false)
      store.applyState({ enabled: false, hasPin: store.hasPin })
    } else {
      if (!hasPin.value) {
        startSetup()
        return
      }
      await service.setEnabled(true)
      store.applyState({ enabled: true, hasPin: store.hasPin })
    }
  } finally {
    loading.value = false
  }
}

const phaseTitle = computed(() => {
  switch (phase.value) {
    case 'enter':
      return hasPin.value && oldPin.value ? '输入新 PIN 码' : '设置 PIN 码'
    case 'confirm':
      return '再次输入 PIN 码'
    case 'old':
      return '输入旧 PIN 码'
    default:
      return '应用锁'
  }
})

const phaseHint = computed(() => {
  switch (phase.value) {
    case 'enter':
      return 'PIN 码为 4 位数字'
    case 'confirm':
      return '请再次输入以确认'
    case 'old':
      return '请输入当前 PIN 码以验证身份'
    default:
      return ''
  }
})
</script>

<template>
  <main class="setup-page">
    <div class="setup-page__safe-top">
      <AppTopBar :title="phaseTitle" :show-back="phase === 'menu'" @back="router.back()" />
    </div>

    <div class="setup-page__content">
      <template v-if="phase === 'menu'">
        <section class="setup-section">
          <div class="setup-section__icon">
            <Lock :size="24" :stroke-width="1.5" aria-hidden="true" />
          </div>
          <h2 class="setup-section__title">应用锁</h2>
          <p class="setup-section__desc">启用后，每次打开应用需要输入 PIN 码解锁。</p>
        </section>

        <BaseCard class="setup-card">
          <div class="setup-row">
            <span>启用应用锁</span>
            <label class="switch">
              <input
                type="checkbox"
                :checked="isEnabled"
                :disabled="loading"
                @change="toggleEnabled"
              />
              <span class="switch__slider" />
            </label>
          </div>
        </BaseCard>

        <BaseCard v-if="hasPin" class="setup-card">
          <button type="button" class="setup-action" :disabled="loading" @click="startChange">
            <span>修改 PIN 码</span>
          </button>
          <button
            type="button"
            class="setup-action setup-action--danger"
            :disabled="loading"
            @click="disable"
          >
            <span>关闭应用锁</span>
          </button>
        </BaseCard>
      </template>

      <template v-else>
        <div class="setup-phase">
          <h2 class="setup-phase__title">{{ phaseHint }}</h2>
          <p v-if="error" class="setup-phase__error">{{ error }}</p>
          <PinPad :length="4" :reset-trigger="resetTrigger" @complete="onComplete" />
        </div>
      </template>
    </div>
  </main>
</template>

<style scoped>
.setup-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.setup-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.setup-page__content {
  display: flex;
  flex-direction: column;
  max-width: 520px;
  padding: var(--space-5) var(--page-gutter);
  margin: auto;
  gap: var(--space-5);
}
.setup-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
  padding: var(--space-4) 0;
}
.setup-section__icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.setup-section__title {
  margin: 0;
  font-size: var(--type-title-size);
  font-weight: 600;
}
.setup-section__desc {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.setup-card {
  padding: 0 var(--space-4);
}
.setup-row {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
}
.setup-row span {
  font-size: var(--type-body-size);
  font-weight: 500;
}
.setup-action {
  display: flex;
  width: 100%;
  min-height: 56px;
  padding: var(--space-3) 0;
  align-items: center;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  text-align: left;
  cursor: pointer;
}
.setup-action:first-child {
  border-top: 0;
}
.setup-action--danger {
  color: var(--color-error);
}
.setup-phase {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-8) 0;
}
.setup-phase__title {
  margin: 0;
  font-size: var(--type-body-size);
  color: var(--color-text-secondary);
  font-weight: 500;
}
.setup-phase__error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--type-caption-size);
}
.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 28px;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.switch__slider {
  position: absolute;
  inset: 0;
  background: var(--color-divider);
  border-radius: var(--radius-pill);
  transition: 0.2s;
}
.switch__slider::before {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}
.switch input:checked + .switch__slider {
  background: var(--color-primary-600);
}
.switch input:checked + .switch__slider::before {
  transform: translateX(20px);
}
</style>
