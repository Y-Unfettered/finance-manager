import { createRouter, createWebHistory } from 'vue-router'

import HomeView from '@/views/HomeView.vue'
import AccountsView from '@/views/AccountsView.vue'
import NewExpenseView from '@/views/NewExpenseView.vue'
import AccountDetailView from '@/views/AccountDetailView.vue'
import PayablesView from '@/views/PayablesView.vue'
import ReceivablesView from '@/views/ReceivablesView.vue'
import BillsView from '@/views/BillsView.vue'
import {
  applyNavigationDirection,
  commitNavigationEntry,
  initializeNavigationEntry,
  prepareNavigationEntry,
} from './navigation-transition'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { swipeBack: false },
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: AccountsView,
    },
    {
      path: '/transactions/new',
      name: 'new-expense',
      component: NewExpenseView,
    },
    {
      path: '/accounts/:accountId',
      name: 'account-detail',
      component: AccountDetailView,
    },
    {
      path: '/receivables',
      name: 'receivables',
      component: ReceivablesView,
    },
    {
      path: '/payables',
      name: 'payables',
      component: PayablesView,
    },
    { path: '/analysis', redirect: '/bills' },
    { path: '/profile', redirect: '/settings' },
    { path: '/bills', name: 'bills', component: BillsView },
    {
      path: '/ledgers',
      name: 'ledgers',
      component: () => import('@/views/LedgerView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/settings/account-icons',
      name: 'account-icons',
      component: () => import('@/views/AccountIconManagementView.vue'),
    },
    {
      path: '/settings/ai-prompt',
      name: 'ai-prompt',
      component: () => import('@/views/AIPromptView.vue'),
    },
    {
      path: '/settings/logs',
      name: 'app-logs',
      component: () => import('@/views/LogView.vue'),
    },
    {
      path: '/categories',
      name: 'categories',
      component: () => import('@/views/CategoryManagementView.vue'),
    },
    {
      path: '/categories/:categoryId/statistics',
      name: 'category-statistics',
      component: () => import('@/views/CategoryStatisticsView.vue'),
    },
    {
      path: '/accounts/:accountId/statistics',
      name: 'account-statistics',
      component: () => import('@/views/AccountStatisticsView.vue'),
    },
    {
      path: '/assets/statistics',
      name: 'asset-statistics',
      component: () => import('@/views/AssetStatisticsView.vue'),
    },
    {
      path: '/assets/statistics/:periodKey',
      name: 'asset-statement',
      component: () => import('@/views/AssetStatementView.vue'),
    },
    {
      path: '/reports/monthly',
      name: 'monthly-report',
      component: () => import('@/views/MonthlyReportView.vue'),
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/ImportView.vue'),
    },
    {
      path: '/import-batches',
      name: 'import-batches',
      component: () => import('@/views/ImportBatchesView.vue'),
    },
    {
      path: '/backup',
      name: 'backup',
      component: () => import('@/views/BackupView.vue'),
    },
    {
      path: '/export',
      name: 'export',
      component: () => import('@/views/ExportView.vue'),
    },
    {
      path: '/budget',
      name: 'budget',
      component: () => import('@/views/BudgetView.vue'),
    },
    {
      path: '/templates',
      name: 'templates',
      component: () => import('@/views/TemplatesView.vue'),
    },
    {
      path: '/reminders',
      name: 'reminders',
      component: () => import('@/views/RemindersView.vue'),
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/TransactionSearchView.vue'),
    },
    {
      path: '/app-lock',
      name: 'app-lock',
      component: () => import('@/views/PinSetupView.vue'),
    },
    {
      path: '/foundation',
      name: 'foundation',
      component: () => import('@/views/FoundationView.vue'),
    },
  ],
})

function historyPosition(): number {
  if (typeof window === 'undefined') return 0
  const position = window.history.state?.position
  return typeof position === 'number' ? position : 0
}

let lastHistoryPosition = historyPosition()
initializeNavigationEntry()
router.beforeEach(() => {
  const nextHistoryPosition = historyPosition()
  applyNavigationDirection(nextHistoryPosition < lastHistoryPosition ? 'back' : 'forward')
  prepareNavigationEntry(nextHistoryPosition !== lastHistoryPosition)
})

router.afterEach((_to, _from, failure) => {
  if (!failure) {
    commitNavigationEntry()
    lastHistoryPosition = historyPosition()
  }
})

export default router