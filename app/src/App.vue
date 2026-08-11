<script setup lang="ts">
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Plus } from '@lucide/vue'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import ClipboardImportDialog from '@/components/ClipboardImportDialog.vue'
import PinUnlockView from '@/views/PinUnlockView.vue'
import RoutePageFrame from '@/components/RoutePageFrame.vue'
import { appLockServiceKey } from '@/features/app-lock/app-lock-service'
import { useAppLockStore } from '@/features/app-lock/app-lock-store'
import { getLogger } from '@/features/debug/app-logger'
import { ClipboardReader } from '@/features/clipboard/clipboard-reader'
import { isConsumedFingerprint } from '@/features/clipboard/clipboard-fingerprint-cache'
import { useAppStore } from '@/stores/app'
import { useClipboardImportStore } from '@/stores/clipboard-import'
import {
  navigationCacheEpoch,
  navigationDirection,
  resetNavigationStateCache,
} from '@/router/navigation-transition'

const appStore = useAppStore()
const route = useRoute()
const lockStore = useAppLockStore()
const appLockService = inject(appLockServiceKey)
const clipboardImportStore = useClipboardImportStore()
const log = getLogger('clipboard')

const privacyVeil = ref(false)
const routeViewKey = computed(
  () => `${navigationCacheEpoch.value}:${String(route.name ?? route.path)}`,
)

const showUnlock = computed(
  () =>
    lockStore.loaded &&
    lockStore.enabled &&
    lockStore.locked &&
    appStore.databaseStatus === 'ready',
)

let appStateListener: { remove: () => void } | undefined
let clipboardCandidateListener: { remove: () => void } | undefined

// 前台剪贴板轮询定时器：app 在前台时定期探测剪贴板，确保用户在前台复制数据后能立即弹窗
let clipboardPollInterval: ReturnType<typeof setInterval> | null = null
const CLIPBOARD_POLL_INTERVAL_MS = 3000 // 3 秒轮询一次

/**
 * 探测剪贴板文本是否像「待导入的交易 JSON 数组」。
 * 与原生侧 ClipboardReaderPlugin.looksLikeTransactionJson 保持一致。
 */
function probeClipboardJson(text: string): { ok: boolean; count: number } {
  const trimmed = text?.trim() ?? ''
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return { ok: false, count: 0 }
  }
  try {
    const arr = JSON.parse(trimmed)
    if (!Array.isArray(arr) || arr.length === 0) return { ok: false, count: 0 }
    const looksLikeTransaction = arr.some(
      (item: unknown) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        ('date' in item || 'amount' in item || 'type' in item),
    )
    return { ok: looksLikeTransaction, count: arr.length }
  } catch {
    return { ok: false, count: 0 }
  }
}

// 防止 appStateClipboardProbe 与 handleOnResume 同时触发，导致两弹窗。
let lastProbedContent = ''
let lastProbedAt = 0
let lastHandledCandidateText = ''

/**
 * 前台剪贴板轮询：app 在前台时每隔 3 秒探测一次剪贴板，
 * 确保用户在前台复制数据后能立即弹窗，无需切换到后台再回来。
 */
function startClipboardPolling(): void {
  stopClipboardPolling()
  clipboardPollInterval = setInterval(async () => {
    void appStateClipboardProbe()
  }, CLIPBOARD_POLL_INTERVAL_MS)
  log.debug('前台剪贴板轮询已启动', { interval: CLIPBOARD_POLL_INTERVAL_MS })
}

function stopClipboardPolling(): void {
  if (clipboardPollInterval !== null) {
    clearInterval(clipboardPollInterval)
    clipboardPollInterval = null
    log.debug('前台剪贴板轮询已停止')
  }
}

/**
 * AppStateChange 兜底：切回前台时主动读剪贴板。
 * 与 Java 插件的 notifyListeners 是互补关系（任意一方触发都行）。
 * 2 秒内与上一次内容相同就跳过，避免 handleOnResume + AppStateChange 双触发弹两次窗。
 */
async function appStateClipboardProbe(): Promise<void> {
  if (appStore.databaseStatus !== 'ready') {
    log.debug('appStateClipboardProbe: 数据库未就绪 -> 跳过')
    return
  }
  if (lockStore.loaded && lockStore.enabled && lockStore.locked) {
    log.debug('appStateClipboardProbe: 应用锁锁定 -> 跳过（解锁后再触发）')
    return
  }
  // 已有候选项没处理，不重复弹
  if (clipboardImportStore.current) {
    log.debug('appStateClipboardProbe: store 有未处理候选项 -> 跳过')
    return
  }
  try {
    const { value, hasContent } = await ClipboardReader.getText()
    if (!hasContent || !value) {
      log.debug('appStateClipboardProbe: 剪贴板为空 -> 跳过')
      return
    }
    const now = Date.now()
    // 2 秒内同样内容 = 大概率是刚从 notifyListeners 处理过
    if (value === lastProbedContent && now - lastProbedAt < 2000) {
      log.debug('appStateClipboardProbe: 2 秒内重复内容 -> 跳过')
      return
    }
    if (value === lastHandledCandidateText) {
      log.debug('appStateClipboardProbe: 已推送到 store 过 -> 跳过')
      return
    }
    lastProbedContent = value
    lastProbedAt = now

    const probe = probeClipboardJson(value)
    log.info('appStateClipboardProbe: probe 结果', {
      ok: probe.ok,
      count: probe.count,
      length: value.length,
      head: value.slice(0, 80),
    })
    if (!probe.ok) return

    // 检查是否已消费过的指纹
    if (isConsumedFingerprint(value)) {
      log.debug('appStateClipboardProbe: 已消费过的指纹 -> 跳过')
      return
    }

    lastHandledCandidateText = value
    clipboardImportStore.setCandidate(value, probe.count)
    log.info('appStateClipboardProbe: 候选项入 store，弹全局确认框', { count: probe.count })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('appStateClipboardProbe: 读剪贴板失败', { msg })
  }
}

onMounted(async () => {
  if (appLockService && appStore.databaseStatus === 'ready') {
    await lockStore.load(appLockService)
    // App 启动时：如已启用应用锁则锁定，需输入 PIN 解锁
    lockStore.lock()
  }

  if (Capacitor.isNativePlatform()) {
    appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        // 切到后台：显示隐私遮挡 + 锁定 + 停止轮询
        privacyVeil.value = true
        lockStore.lock()
        stopClipboardPolling()
      } else {
        // 回到前台：隐藏遮挡 + 启动轮询
        privacyVeil.value = false
        void appStateClipboardProbe()
        startClipboardPolling()
      }
    })

    log.info('App.vue: 注册 clipboardImportCandidate 监听器')

    // 监听原生 ClipboardReaderPlugin 推来的「检测到待导入账单」事件
    // 由 ClipboardReaderPlugin.handleOnResume() 在 app 切回前台时触发
    clipboardCandidateListener = await ClipboardReader.addListener(
      'clipboardImportCandidate',
      ({ value }) => {
        if (!value) {
          log.warn('收到 clipboardImportCandidate 事件，但 value 为空')
          return
        }
        log.info('收到 clipboardImportCandidate 事件（来自 Java notifyListeners）', {
          length: value.length,
          head: value.slice(0, 100),
        })
        // 与兜底 appStateClipboardProbe 去重：刚在 2 秒内处理过同样内容就跳过
        const now = Date.now()
        if (value === lastHandledCandidateText) {
          log.info('notifyListeners: 已由 appStateClipboardProbe 处理过 -> 跳过')
          return
        }
        if (value === lastProbedContent && now - lastProbedAt < 2000) {
          log.info('notifyListeners: 2 秒内 appStateClipboardProbe 已 probe -> 跳过')
          return
        }
        // 数据库未就绪时不弹窗（避免初始化阶段被打扰）
        if (appStore.databaseStatus !== 'ready') {
          log.warn('数据库未就绪 (status=' + appStore.databaseStatus + ') -> 跳过')
          return
        }
        // 应用锁锁定时不弹窗（解锁后 onResume 会再触发一次）
        if (lockStore.loaded && lockStore.enabled && lockStore.locked) {
          log.warn('应用锁锁定状态 -> 跳过')
          return
        }
        const probe = probeClipboardJson(value)
        log.info('前端 probeClipboardJson 结果', {
          ok: probe.ok,
          count: probe.count,
        })
        if (!probe.ok) {
          log.warn('probe 失败 -> 跳过')
          return
        }
        // 检查是否已消费过的指纹
        if (isConsumedFingerprint(value)) {
          log.debug('notifyListeners: 已消费过的指纹 -> 跳过')
          return
        }
        lastHandledCandidateText = value
        clipboardImportStore.setCandidate(value, probe.count)
        log.info('候选项已推入 store，弹全局确认框', { count: probe.count })
      },
    )

    // 冷启动兜底：handleOnResume 在 Vue 挂载前就执行了，notifyListeners 事件已丢失。
    // AppStateChange 在冷启动时也不会触发（没有 inactive→active 转变）。
    // 所以在监听器注册完成后，等数据库就绪时主动查一次剪贴板。
    if (appStore.databaseStatus === 'ready') {
      void appStateClipboardProbe()
      startClipboardPolling()
    } else {
      const stopWatch = watch(
        () => appStore.databaseStatus,
        (status) => {
          if (status === 'ready') {
            stopWatch()
            void appStateClipboardProbe()
            startClipboardPolling()
          }
        },
      )
    }
  } else {
    log.info('非原生平台，跳过 clipboardImportCandidate 监听器注册')
  }
})

onUnmounted(() => {
  appStateListener?.remove()
  clipboardCandidateListener?.remove()
  stopClipboardPolling()
})

watch(
  () => appStore.ledgerId,
  (ledgerId, previousLedgerId) => {
    if (previousLedgerId && ledgerId !== previousLedgerId) resetNavigationStateCache()
  },
)
</script>

<template>
  <PinUnlockView v-if="showUnlock" />
  <div v-else class="app-navigation" :data-navigation-direction="navigationDirection">
    <RouterView v-slot="{ Component }">
      <Transition name="route-page">
        <KeepAlive :max="32">
          <RoutePageFrame
            v-if="Component"
            :key="routeViewKey"
            :view-component="Component"
            :contained-scroll="route.name === 'accounts' || route.name === 'new-expense'"
          />
        </KeepAlive>
      </Transition>
    </RouterView>
    <RouterLink
      v-if="route.name === 'home'"
      class="home-create-fab"
      :class="{ 'home-create-fab--hidden': !appStore.homeFabVisible }"
      :to="{ name: 'new-expense' }"
      aria-label="记一笔"
    >
      <Plus :size="30" :stroke-width="2" aria-hidden="true" />
    </RouterLink>
  </div>

  <!-- 隐私遮挡：切到后台时覆盖内容，防止任务列表预览泄露账目 -->
  <Transition name="fade">
    <div v-if="privacyVeil" class="privacy-veil">
      <span class="privacy-veil__text">财务经理</span>
    </div>
  </Transition>

  <!-- 全局剪贴板导入确认弹窗：app 切回前台时若剪贴板有待导入 JSON 则显示 -->
  <ClipboardImportDialog />
</template>

<style>
.app-navigation {
  min-height: 100dvh;
  overflow-x: clip;
  background: var(--color-background);
}

.route-page-frame {
  position: fixed;
  inset: 0;
  width: 100%;
  max-width: 100vw;
  height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-x: none;
  background: var(--color-background);
  backface-visibility: hidden;
  contain: layout paint;
  transform: translate3d(0, 0, 0);
}

.route-page-frame--contained-scroll {
  overflow-y: hidden;
}

.route-page-enter-active,
.route-page-leave-active {
  will-change: transform;
}

.route-page-enter-active {
  z-index: 62;
  transition: transform 260ms var(--ease-emphasized);
}

.route-page-leave-active {
  z-index: 61;
  transition:
    transform 260ms var(--ease-emphasized),
    opacity 260ms var(--ease-emphasized);
}

.app-navigation[data-navigation-direction='forward'] .route-page-enter-from {
  transform: translate3d(100%, 0, 0);
}

.app-navigation[data-navigation-direction='forward'] .route-page-leave-to {
  opacity: 0.92;
  transform: translate3d(-18%, 0, 0);
}

.app-navigation[data-navigation-direction='back'] .route-page-leave-active {
  z-index: 62;
}

.app-navigation[data-navigation-direction='back'] .route-page-leave-to {
  transform: translate3d(100%, 0, 0);
}

.app-navigation[data-navigation-direction='back'] .route-page-enter-active {
  z-index: 61;
  transition:
    transform 260ms var(--ease-emphasized),
    opacity 260ms var(--ease-emphasized);
}

.app-navigation[data-navigation-direction='back'] .route-page-enter-from {
  opacity: 0.92;
  transform: translate3d(-18%, 0, 0);
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

.home-create-fab {
  position: fixed;
  z-index: 20;
  bottom: calc(var(--space-5) + env(safe-area-inset-bottom));
  left: 50%;
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  color: white;
  background: var(--color-primary-600);
  border-radius: var(--radius-pill);
  box-shadow: 0 10px 28px rgb(var(--color-primary-rgb) / 28%);
  transform: translateX(-50%);
  transition:
    box-shadow var(--motion-fast) var(--ease-standard),
    opacity var(--motion-base) var(--ease-emphasized),
    transform var(--motion-base) var(--ease-emphasized);
}

.home-create-fab:active {
  box-shadow: 0 6px 18px rgb(var(--color-primary-rgb) / 22%);
  transform: translateX(-50%) scale(0.96);
}

.home-create-fab--hidden {
  pointer-events: none;
  opacity: 0;
  transform: translateX(-50%) scale(0.55);
}
</style>
