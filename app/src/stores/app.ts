import { defineStore } from 'pinia'

export type DatabaseStatus = 'not_applicable' | 'initializing' | 'ready' | 'error'

export const useAppStore = defineStore('app', {
  state: () => ({
    appName: '财务经理',
    version: __APP_VERSION__,
    profileName: 'lemon',
    ledgerName: '日常账本',
    selectedHomePeriod: restoreHomePeriod(),
    homeFabVisible: true,
    ledgerId: undefined as string | undefined,
    databaseStatus: 'not_applicable' as DatabaseStatus,
    schemaVersion: 0,
    databaseError: undefined as string | undefined,
  }),
  actions: {
    markDatabaseInitializing() {
      this.databaseStatus = 'initializing'
      this.databaseError = undefined
    },
    markDatabaseReady(schemaVersion: number, ledgerId?: string, ledgerName?: string) {
      this.databaseStatus = 'ready'
      this.schemaVersion = schemaVersion
      this.ledgerId = ledgerId
      if (ledgerName) this.ledgerName = ledgerName
      this.databaseError = undefined
    },
    selectLedger(ledgerId: string, ledgerName: string) {
      this.ledgerId = ledgerId
      this.ledgerName = ledgerName
      localStorage.setItem('finance-manager:selected-ledger', ledgerId)
    },
    selectHomePeriod(periodKey: string) {
      this.selectedHomePeriod = periodKey
      localStorage.setItem('finance-manager:home-period', periodKey)
    },
    markDatabaseError(error: unknown) {
      this.databaseStatus = 'error'
      this.databaseError = error instanceof Error ? error.message : String(error)
    },
  },
})

function restoreHomePeriod(): string {
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (typeof localStorage === 'undefined') return fallback
  const stored = localStorage.getItem('finance-manager:home-period')
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(stored ?? '') ? stored! : fallback
}
