<script setup lang="ts">
import {
  Bell,
  ChevronRight,
  DatabaseBackup,
  Download,
  FileUp,
  History,
  Info,
  Lock,
  PiggyBank,
  Repeat,
  Search,
  ShieldCheck,
} from '@lucide/vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import { useAppLockStore } from '@/features/app-lock/app-lock-store'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const lockStore = useAppLockStore()

// 直接读取 store 响应式状态，不调用 load（避免子页面挂载触发重新锁定）
const lockEnabled = computed(() => lockStore.enabled)

const efficiencyEntries = [
  {
    id: 'budget',
    label: '预算管理',
    description: '月度预算与分类上限、超支预警',
    icon: PiggyBank,
    route: 'budget',
  },
  {
    id: 'templates',
    label: '模板与周期交易',
    description: '常用记账模板、周期性自动记账',
    icon: Repeat,
    route: 'templates',
  },
  {
    id: 'reminders',
    label: '到期提醒',
    description: '信用卡还款日、应收款、预付卡到期',
    icon: Bell,
    route: 'reminders',
  },
  {
    id: 'search',
    label: '流水搜索',
    description: '按关键词、账户、分类、金额、日期筛选',
    icon: Search,
    route: 'search',
  },
] as const

const dataEntries = [
  {
    id: 'import',
    label: '导入账单',
    description: '从 CSV 文件批量导入历史交易',
    icon: FileUp,
    route: 'import',
  },
  {
    id: 'batches',
    label: '导入批次管理',
    description: '查看历史导入批次并撤销',
    icon: History,
    route: 'import-batches',
  },
  {
    id: 'backup',
    label: '备份与恢复',
    description: '生成完整备份包、从备份恢复账本',
    icon: DatabaseBackup,
    route: 'backup',
  },
  {
    id: 'export',
    label: '导出账单',
    description: '将交易导出为 CSV 或 JSON',
    icon: Download,
    route: 'export',
  },
] as const

const aboutItems = [
  { label: '应用名称', value: appStore.appName },
  { label: '当前版本', value: `v${appStore.version}` },
  { label: '账本', value: appStore.ledgerName },
  {
    label: '数据库版本',
    value: appStore.schemaVersion ? `schema v${appStore.schemaVersion}` : '—',
  },
] as const

const isReady = computed(() => appStore.databaseStatus === 'ready')

function go(route: string): void {
  router.push({ name: route })
}
</script>

<template>
  <main class="profile-page">
    <div class="profile-page__safe-top">
      <AppTopBar title="我的" :show-back="false" />
    </div>

    <div class="profile-page__content">
      <section class="profile-section">
        <h2>安全</h2>
        <BaseCard class="entry-list">
          <button type="button" class="entry-item" :disabled="!isReady" @click="go('app-lock')">
            <span class="entry-icon">
              <Lock :size="20" :stroke-width="1.75" aria-hidden="true" />
            </span>
            <span class="entry-main">
              <strong>应用锁</strong>
              <small>{{ lockEnabled ? '已启用 PIN 码保护' : '设置 PIN 码保护账本隐私' }}</small>
            </span>
            <ChevronRight :size="20" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </BaseCard>
      </section>

      <section class="profile-section">
        <h2>日常效率</h2>
        <BaseCard class="entry-list">
          <button
            v-for="entry in efficiencyEntries"
            :key="entry.id"
            type="button"
            class="entry-item"
            :disabled="!isReady"
            @click="go(entry.route)"
          >
            <span class="entry-icon">
              <component :is="entry.icon" :size="20" :stroke-width="1.75" aria-hidden="true" />
            </span>
            <span class="entry-main">
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.description }}</small>
            </span>
            <ChevronRight :size="20" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </BaseCard>
      </section>

      <section class="profile-section">
        <h2>数据管理</h2>
        <BaseCard class="entry-list">
          <button
            v-for="entry in dataEntries"
            :key="entry.id"
            type="button"
            class="entry-item"
            :disabled="!isReady"
            @click="go(entry.route)"
          >
            <span class="entry-icon">
              <component :is="entry.icon" :size="20" :stroke-width="1.75" aria-hidden="true" />
            </span>
            <span class="entry-main">
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.description }}</small>
            </span>
            <ChevronRight :size="20" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </BaseCard>
        <p v-if="!isReady" class="profile-hint">数据库尚未就绪，数据管理功能暂不可用。</p>
      </section>

      <section class="profile-section">
        <h2>关于</h2>
        <BaseCard class="about-list">
          <div v-for="item in aboutItems" :key="item.label" class="about-item">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </BaseCard>
      </section>

      <section class="profile-section profile-section--note">
        <ShieldCheck :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span>所有数据仅保存在本机，不联网上传。请定期备份。</span>
      </section>

      <section class="profile-section profile-section--note">
        <Info :size="18" :stroke-width="1.75" aria-hidden="true" />
        <span>导入前请先备份当前账本；恢复操作会覆盖现有数据。</span>
      </section>
    </div>
  </main>
</template>

<style scoped>
.profile-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--size-bottom-nav) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.profile-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.profile-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) var(--space-10);
  margin: auto;
  gap: var(--space-5);
}
.profile-section h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--type-section-title-size);
}
.entry-list {
  padding: 0 var(--space-4);
}
.entry-item {
  display: grid;
  width: 100%;
  min-height: 68px;
  padding: var(--space-3) 0;
  grid-template-columns: 40px minmax(0, 1fr) 20px;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-primary);
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}
.entry-item:first-child {
  border-top: 0;
}
.entry-item:disabled {
  opacity: 0.5;
}
.entry-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.entry-main {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.entry-main strong {
  font-size: var(--type-list-primary-size);
  font-weight: 600;
}
.entry-main small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.4;
}
.entry-item :nth-child(3) {
  color: var(--color-text-tertiary);
}
.about-list {
  padding: 0 var(--space-4);
}
.about-item {
  display: flex;
  min-height: 52px;
  padding: var(--space-3) 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-top: 1px solid var(--color-divider);
}
.about-item:first-child {
  border-top: 0;
}
.about-item span {
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
}
.about-item strong {
  font-size: var(--type-body-size);
  font-weight: 500;
}
.profile-section--note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.6;
}
.profile-section--note svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--color-text-tertiary);
}
.profile-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
</style>
