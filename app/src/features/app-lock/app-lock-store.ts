import { defineStore } from 'pinia'

import type { AppLockService, AppLockState } from './app-lock-service'

export const useAppLockStore = defineStore('appLock', {
  state: () => ({
    enabled: false,
    hasPin: false,
    loaded: false,
    locked: false, // 是否处于锁定状态（需输入 PIN 解锁）
  }),
  actions: {
    async load(service: AppLockService): Promise<void> {
      const state = await service.getState()
      this.enabled = state.enabled
      this.hasPin = state.hasPin
      this.loaded = true
      // 注意：不在此处重置 locked，避免子页面挂载时触发重新锁定。
      // App 启动/切后台时的锁定由调用方显式调用 lock()。
    },
    applyState(state: AppLockState): void {
      this.enabled = state.enabled
      this.hasPin = state.hasPin
    },
    unlock(): void {
      this.locked = false
    },
    lock(): void {
      if (this.enabled) {
        this.locked = true
      }
    },
  },
})
