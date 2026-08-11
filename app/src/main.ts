import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { installGlobalPinia } from '@/features/debug/app-logger'
import { initializeFinanceDatabase, requireFinanceDatabase } from './db/bootstrap'
import { FinanceService, financeServiceKey } from './features/finance/finance-service'
import { BackupService, backupServiceKey } from './features/backup/backup-service'
import { RestoreService, restoreServiceKey } from './features/backup/restore-service'
import { ExportService, exportServiceKey } from './features/export/export-service'
import { ImportService, importServiceKey } from './features/import/import-service'
import { AppLockService, appLockServiceKey } from './features/app-lock/app-lock-service'
import { BudgetService, budgetServiceKey } from './features/budget/budget-service'
import { TemplateService, templateServiceKey } from './features/templates/template-service'
import { RecurringService, recurringServiceKey } from './features/recurring/recurring-service'
import { ReminderService, reminderServiceKey } from './features/reminders/reminder-service'
import { SearchService, searchServiceKey } from './features/search/search-service'
import {
  HomePreferencesService,
  homePreferencesServiceKey,
} from './features/preferences/home-preferences-service'
import { StatisticsService, statisticsServiceKey } from './features/statistics/statistics-service'
import { LedgerService, ledgerServiceKey } from './features/ledger/ledger-service'
import { LedgerRepository } from './db/repositories/ledger-repository'
import { systemClock } from './domain/time'
import { systemIdGenerator } from './domain/identity'
import router from './router'
import { createRouterTouch } from './router/vue-router-touch'
import { useAppStore } from './stores/app'
import './design-system/tokens.css'
import './design-system/global.css'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  installGlobalPinia(pinia)
  app
    .use(pinia)
    .use(router)
    .use(
      createRouterTouch(router, {
        edgeWidth: Number.POSITIVE_INFINITY,
        minDistance: 72,
        maxVerticalDistance: 80,
        minVelocity: 0.35,
      }),
    )

  const appStore = useAppStore(pinia)
  appStore.markDatabaseInitializing()

  try {
    const database = await initializeFinanceDatabase()
    if (database.migrationError) {
      appStore.markDatabaseError(
        `数据库升级失败：${database.migrationError}。升级前已自动备份到：${database.migrationBackupPath ?? 'Documents 目录'}`,
      )
    } else if (database.initialized) {
      const db = requireFinanceDatabase()
      const preferredLedgerId = localStorage.getItem('finance-manager:selected-ledger')
      const preferredLedger = preferredLedgerId
        ? await new LedgerRepository(db).findById(preferredLedgerId)
        : undefined
      const initialLedger =
        preferredLedger ??
        (database.ledgerId ? await new LedgerRepository(db).findById(database.ledgerId) : undefined)
      appStore.markDatabaseReady(database.schemaVersion, initialLedger?.id, initialLedger?.name)
      app.provide(financeServiceKey, new FinanceService(db, systemIdGenerator, systemClock))
      app.provide(
        importServiceKey,
        new ImportService({ database: db, clock: systemClock, ids: systemIdGenerator }),
      )
      app.provide(
        backupServiceKey,
        new BackupService({ database: db, clock: systemClock, appVersion: __APP_VERSION__ }),
      )
      app.provide(
        restoreServiceKey,
        new RestoreService({ database: db, clock: systemClock, appVersion: __APP_VERSION__ }),
      )
      app.provide(exportServiceKey, new ExportService(db))
      app.provide(appLockServiceKey, new AppLockService(db, systemClock))
      app.provide(budgetServiceKey, new BudgetService(db, systemIdGenerator, systemClock))
      app.provide(templateServiceKey, new TemplateService(db, systemIdGenerator, systemClock))
      app.provide(recurringServiceKey, new RecurringService(db, systemIdGenerator, systemClock))
      app.provide(reminderServiceKey, new ReminderService(db, systemIdGenerator, systemClock))
      app.provide(searchServiceKey, new SearchService(db, systemIdGenerator, systemClock))
      app.provide(homePreferencesServiceKey, new HomePreferencesService(db, systemClock))
      app.provide(statisticsServiceKey, new StatisticsService(db, systemIdGenerator, systemClock))
      app.provide(ledgerServiceKey, new LedgerService(db, systemIdGenerator, systemClock))
    } else {
      appStore.databaseStatus = 'not_applicable'
    }
  } catch (error) {
    appStore.markDatabaseError(error)
  }

  app.mount('#app')
}

void bootstrap()
