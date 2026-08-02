import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { initializeFinanceDatabase } from './db/bootstrap'
import router from './router'
import { useAppStore } from './stores/app'
import './design-system/tokens.css'
import './design-system/global.css'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia).use(router)

  const appStore = useAppStore(pinia)
  appStore.markDatabaseInitializing()

  try {
    const database = await initializeFinanceDatabase()
    if (database.initialized) {
      appStore.markDatabaseReady(database.schemaVersion, database.ledgerId)
    } else {
      appStore.databaseStatus = 'not_applicable'
    }
  } catch (error) {
    appStore.markDatabaseError(error)
  }

  app.mount('#app')
}

void bootstrap()
