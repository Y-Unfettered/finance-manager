import { createRouter, createWebHistory } from 'vue-router'

import FoundationView from '@/views/FoundationView.vue'
import AccountDetailView from '@/views/AccountDetailView.vue'
import BackupView from '@/views/BackupView.vue'
import BudgetView from '@/views/BudgetView.vue'
import ExportView from '@/views/ExportView.vue'
import ImportBatchesView from '@/views/ImportBatchesView.vue'
import ImportView from '@/views/ImportView.vue'
import NewExpenseView from '@/views/NewExpenseView.vue'
import HomeView from '@/views/HomeView.vue'
import AccountsView from '@/views/AccountsView.vue'
import PayablesView from '@/views/PayablesView.vue'
import PinSetupView from '@/views/PinSetupView.vue'
import BillsView from '@/views/BillsView.vue'
import CategoryManagementView from '@/views/CategoryManagementView.vue'
import LedgerView from '@/views/LedgerView.vue'
import LogView from '@/views/LogView.vue'
import SettingsView from '@/views/SettingsView.vue'
import AccountStatisticsView from '@/views/AccountStatisticsView.vue'
import AccountIconManagementView from '@/views/AccountIconManagementView.vue'
import CategoryStatisticsView from '@/views/CategoryStatisticsView.vue'
import ReceivablesView from '@/views/ReceivablesView.vue'
import RemindersView from '@/views/RemindersView.vue'
import TemplatesView from '@/views/TemplatesView.vue'
import TransactionSearchView from '@/views/TransactionSearchView.vue'
import MonthlyReportView from '@/views/MonthlyReportView.vue'
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
    { path: '/ledgers', name: 'ledgers', component: LedgerView },
    { path: '/bills', name: 'bills', component: BillsView },
    { path: '/settings', name: 'settings', component: SettingsView },
    {
      path: '/settings/account-icons',
      name: 'account-icons',
      component: AccountIconManagementView,
    },
    {
      path: '/settings/logs',
      name: 'app-logs',
      component: LogView,
    },
    { path: '/categories', name: 'categories', component: CategoryManagementView },
    {
      path: '/categories/:categoryId/statistics',
      name: 'category-statistics',
      component: CategoryStatisticsView,
    },
    {
      path: '/accounts/:accountId/statistics',
      name: 'account-statistics',
      component: AccountStatisticsView,
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
    { path: '/reports/monthly', name: 'monthly-report', component: MonthlyReportView },
    {
      path: '/import',
      name: 'import',
      component: ImportView,
    },
    {
      path: '/import-batches',
      name: 'import-batches',
      component: ImportBatchesView,
    },
    {
      path: '/backup',
      name: 'backup',
      component: BackupView,
    },
    {
      path: '/app-lock',
      name: 'app-lock',
      component: PinSetupView,
    },
    {
      path: '/export',
      name: 'export',
      component: ExportView,
    },
    {
      path: '/foundation',
      name: 'foundation',
      component: FoundationView,
    },
    {
      path: '/budget',
      name: 'budget',
      component: BudgetView,
    },
    {
      path: '/templates',
      name: 'templates',
      component: TemplatesView,
    },
    {
      path: '/reminders',
      name: 'reminders',
      component: RemindersView,
    },
    {
      path: '/search',
      name: 'search',
      component: TransactionSearchView,
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
