import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    appName: '财务经理',
    version: __APP_VERSION__,
    ledgerName: '日常账本',
  }),
})
