<script setup lang="ts">
import {
  ChevronRight,
  DatabaseBackup,
  Download,
  FileUp,
  FolderTree,
  Lock,
  PiggyBank,
} from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import type { AccountBalanceRecord } from '@/domain/entities'
import { useFinanceService } from '@/features/finance/finance-service'
import {
  useHomePreferencesService,
  type HomePreferences,
} from '@/features/preferences/home-preferences-service'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const preferencesService = useHomePreferencesService()
const finance = useFinanceService()
const accounts = ref<AccountBalanceRecord[]>([])
const preferences = ref<HomePreferences>({
  summaryDisplayType: 'income_expense',
  summaryRangeType: '7d',
  amountsHidden: false,
  rememberLastAccount: true,
  appearance: 'system',
})
const saving = ref(false)

const entries = [
  { label: '分类管理', description: '一级、二级分类和图标', icon: FolderTree, route: 'categories' },
  {
    label: '预算管理',
    description: '总预算、分类预算和自动复制',
    icon: PiggyBank,
    route: 'budget',
  },
  { label: '应用锁', description: 'PIN 码保护账本', icon: Lock, route: 'app-lock' },
  { label: '导入账单', description: '导入历史交易', icon: FileUp, route: 'import' },
  { label: '备份与恢复', description: '完整本地备份', icon: DatabaseBackup, route: 'backup' },
  { label: '导出账单', description: 'CSV 或 JSON', icon: Download, route: 'export' },
] as const

async function load(): Promise<void> {
  if (!preferencesService || !appStore.ledgerId) return
  ;[preferences.value, accounts.value] = await Promise.all([
    preferencesService.get(appStore.ledgerId),
    finance ? finance.listAccounts(appStore.ledgerId) : Promise.resolve([]),
  ])
}

async function save(): Promise<void> {
  if (!preferencesService || !appStore.ledgerId || saving.value) return
  saving.value = true
  try {
    await preferencesService.save(appStore.ledgerId, preferences.value)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="settings-page">
    <div class="safe-top"><AppTopBar title="设置" @back="router.back()" /></div>
    <div class="content">
      <section>
        <h2>首页展示</h2>
        <BaseCard class="settings-card">
          <label>
            <span><strong>最近汇总类型</strong><small>首页图表展示的数据</small></span>
            <select v-model="preferences.summaryDisplayType" @change="save">
              <option value="income_expense">收入与支出</option>
              <option value="expense">仅支出</option>
            </select>
          </label>
          <label>
            <span><strong>最近汇总范围</strong><small>选择不显示后卡片会隐藏</small></span>
            <select v-model="preferences.summaryRangeType" @change="save">
              <option value="week">本周</option>
              <option value="7d">最近 7 日</option>
              <option value="15d">最近 15 日</option>
              <option value="hidden">不显示</option>
            </select>
          </label>
          <label>
            <span><strong>默认隐藏首页金额</strong><small>进入首页时模糊显示金额</small></span>
            <input v-model="preferences.amountsHidden" type="checkbox" @change="save" />
          </label>
        </BaseCard>
      </section>
      <section>
        <h2>记账设置</h2>
        <BaseCard class="settings-card">
          <label>
            <span><strong>默认支出账户</strong><small>新建支出时优先选择</small></span>
            <select v-model="preferences.defaultExpenseAccountId" @change="save">
              <option value="">自动选择</option>
              <option v-for="account in accounts" :key="account.id" :value="account.id">
                {{ account.name }}
              </option>
            </select>
          </label>
          <label>
            <span><strong>默认收入账户</strong><small>新建收入时优先选择</small></span>
            <select v-model="preferences.defaultIncomeAccountId" @change="save">
              <option value="">自动选择</option>
              <option v-for="account in accounts" :key="account.id" :value="account.id">
                {{ account.name }}
              </option>
            </select>
          </label>
          <label>
            <span><strong>记住上次使用账户</strong><small>优先于默认账户</small></span>
            <input v-model="preferences.rememberLastAccount" type="checkbox" @change="save" />
          </label>
        </BaseCard>
      </section>
      <section>
        <h2>外观</h2>
        <BaseCard class="settings-card">
          <label>
            <span><strong>主题</strong><small>跟随系统或固定明暗模式</small></span>
            <select v-model="preferences.appearance" @change="save">
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
        </BaseCard>
      </section>
      <section>
        <h2>账本与数据</h2>
        <BaseCard class="entry-card">
          <button
            v-for="entry in entries"
            :key="entry.route"
            type="button"
            @click="router.push({ name: entry.route })"
          >
            <span class="entry-icon"><component :is="entry.icon" :size="20" /></span>
            <span
              ><strong>{{ entry.label }}</strong
              ><small>{{ entry.description }}</small></span
            >
            <ChevronRight :size="19" />
          </button>
        </BaseCard>
      </section>
      <p class="privacy-note">账本数据默认仅保存在本机，请定期创建备份。</p>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-5);
}
h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--type-section-title-size);
}
.settings-card,
.entry-card {
  padding: 0 var(--space-4);
}
label,
.entry-card button {
  display: grid;
  min-height: 68px;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--space-3);
  border-top: 1px solid var(--color-divider);
}
label:first-child,
.entry-card button:first-child {
  border-top: 0;
}
label > span,
label > span > small,
.entry-card button > span:nth-child(2) {
  display: grid;
}
.settings-card small,
.entry-card small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
select {
  max-width: 150px;
  padding: 8px;
  color: var(--color-text-primary);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  background: var(--color-background);
}
.settings-card input[type='checkbox'] {
  width: 22px;
  height: 22px;
  accent-color: var(--color-primary-600);
}
.entry-card button {
  width: 100%;
  padding: 0;
  grid-template-columns: 40px 1fr 20px;
  color: inherit;
  text-align: left;
  background: transparent;
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
}
.entry-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: 50%;
}
.entry-card button > svg {
  color: var(--color-text-tertiary);
}
.privacy-note {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}
</style>
