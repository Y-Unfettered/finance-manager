import { defineStore } from 'pinia'

export type DatabaseStatus = 'not_applicable' | 'initializing' | 'ready' | 'error'

export const useAppStore = defineStore('app', {
  state: () => ({
    appName: '财务经理',
    version: __APP_VERSION__,
    ledgerName: '日常账本',
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
    markDatabaseError(error: unknown) {
      this.databaseStatus = 'error'
      this.databaseError = error instanceof Error ? error.message : String(error)
    },
  },
})
