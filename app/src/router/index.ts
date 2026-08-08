import { createRouter, createWebHistory } from 'vue-router'

import FoundationView from '@/views/FoundationView.vue'
import AccountDetailView from '@/views/AccountDetailView.vue'
import BackupView from '@/views/BackupView.vue'
import BudgetView from '@/views/BudgetView.vue'
import ExportView from '@/views/ExportView.vue'
import ImportBatchesView from '@/views/ImportBatchesView.vue'
import ImportView from '@/views/ImportView.vue'
import NewExpenseView from '@/views/NewExpenseView.vue'
import OverviewSwipeView from '@/views/OverviewSwipeView.vue'
import PayablesView from '@/views/PayablesView.vue'
import PinSetupView from '@/views/PinSetupView.vue'
import BillsView from '@/views/BillsView.vue'
import CategoryManagementView from '@/views/CategoryManagementView.vue'
import LedgerView from '@/views/LedgerView.vue'
import SettingsView from '@/views/SettingsView.vue'
import AccountStatisticsView from '@/views/AccountStatisticsView.vue'
import AssetStatisticsView from '@/views/AssetStatisticsView.vue'
import CategoryStatisticsView from '@/views/CategoryStatisticsView.vue'
import ReceivablesView from '@/views/ReceivablesView.vue'
import RemindersView from '@/views/RemindersView.vue'
import TemplatesView from '@/views/TemplatesView.vue'
import TransactionSearchView from '@/views/TransactionSearchView.vue'
import MonthlyReportView from '@/views/MonthlyReportView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: OverviewSwipeView,
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: OverviewSwipeView,
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
    { path: '/assets/statistics', name: 'asset-statistics', component: AssetStatisticsView },
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

export default router
