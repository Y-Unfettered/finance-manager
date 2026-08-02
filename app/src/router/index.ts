import { createRouter, createWebHistory } from 'vue-router'

import AccountsView from '@/views/AccountsView.vue'
import FoundationView from '@/views/FoundationView.vue'
import HomeView from '@/views/HomeView.vue'
import NewExpenseView from '@/views/NewExpenseView.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { bottomNav: true },
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: AccountsView,
      meta: { bottomNav: true },
    },
    {
      path: '/transactions/new',
      name: 'new-expense',
      component: NewExpenseView,
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
      component: PlaceholderView,
      props: { title: '我的', description: '账本设置、数据备份和自动记账入口将在后续版本开放。' },
      meta: { bottomNav: true },
    },
    {
      path: '/foundation',
      name: 'foundation',
      component: FoundationView,
    },
  ],
})

export default router
