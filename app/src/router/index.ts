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
import PlaceholderView from '@/views/PlaceholderView.vue'
import ProfileView from '@/views/ProfileView.vue'
import ReceivablesView from '@/views/ReceivablesView.vue'
import RemindersView from '@/views/RemindersView.vue'
import TemplatesView from '@/views/TemplatesView.vue'
import TransactionSearchView from '@/views/TransactionSearchView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: OverviewSwipeView,
      meta: { bottomNav: true },
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: OverviewSwipeView,
      meta: { bottomNav: true },
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
    {
      path: '/analysis',
      name: 'analysis',
      component: PlaceholderView,
      props: { title: '分析', description: '周报、月报和趋势分析将在后续版本逐步开放。' },
      meta: { bottomNav: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { bottomNav: true },
    },
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
