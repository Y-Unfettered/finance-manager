<script setup lang="ts">
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import AppBottomNav from '@/components/AppBottomNav.vue'
import PinUnlockView from '@/views/PinUnlockView.vue'
import { appLockServiceKey } from '@/features/app-lock/app-lock-service'
import { useAppLockStore } from '@/features/app-lock/app-lock-store'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()
const lockStore = useAppLockStore()
const appLockService = inject(appLockServiceKey)

const privacyVeil = ref(false)

const showUnlock = computed(
  () =>
    lockStore.loaded &&
    lockStore.enabled &&
    lockStore.locked &&
    appStore.databaseStatus === 'ready',
)

let appStateListener: { remove: () => void } | undefined

onMounted(async () => {
  if (appLockService && appStore.databaseStatus === 'ready') {
    await lockStore.load(appLockService)
    // App 启动时：如已启用应用锁则锁定，需输入 PIN 解锁
    lockStore.lock()
  }

  if (Capacitor.isNativePlatform()) {
    appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        // 切到后台：显示隐私遮挡 + 锁定
        privacyVeil.value = true
        lockStore.lock()
      } else {
        // 回到前台：隐藏遮挡（如已锁定，解锁页会显示）
        privacyVeil.value = false
      }
    })
  }
})

onUnmounted(() => {
  appStateListener?.remove()
})
</script>

<template>
  <PinUnlockView v-if="showUnlock" />
  <template v-else>
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
    <AppBottomNav v-if="route.meta.bottomNav" />
  </template>

  <!-- 隐私遮挡：切到后台时覆盖内容，防止任务列表预览泄露账目 -->
  <Transition name="fade">
    <div v-if="privacyVeil" class="privacy-veil">
      <span class="privacy-veil__text">财务经理</span>
    </div>
  </Transition>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.page-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.privacy-veil {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  background: var(--color-surface);
}

.privacy-veil__text {
  font-size: var(--type-title-size);
  font-weight: 600;
  color: var(--color-text-tertiary);
}
</style>
