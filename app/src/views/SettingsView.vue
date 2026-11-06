<script setup lang="ts">
import {
  Bug,
  ChevronRight,
  DatabaseBackup,
  Download,
  FileUp,
  FolderTree,
  Images,
  Lock,
  MessageSquare,
  PiggyBank,
  Receipt,
  Scan,
  ScrollText,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppSelect from '@/components/AppSelect.vue'
import AppSwitch from '@/components/AppSwitch.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import SettingsSection from '@/components/SettingsSection.vue'
import type { AccountBalanceRecord } from '@/domain/entities'
import { useFinanceService } from '@/features/finance/finance-service'
import { PaymentCapture } from '@/features/payment-capture/payment-capture-reader'
import {
  useHomePreferencesService,
  type HomePreferences,
  type HomeSummaryDisplayType,
  type HomeSummaryRangeType,
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
  defaultExpenseAccountId: '',
  defaultIncomeAccountId: '',
  amountsHidden: false,
  rememberLastAccount: true,
  appearance: 'system',
  colorTheme: 'green',
})
const saving = ref(false)

/** 滚动锁取证（临时，PRD BUG-02）：实时展示 body/frame 滚动状态，复现"取消后无法滚动"时看这里。 */
const scrollDiagnosticsText = ref('')
let scrollDiagnosticsTimer = 0

function updateScrollDiagnostics(): void {
  const body = document.body
  const frame = document.querySelector<HTMLElement>('.route-page-frame')
  const htmlOverflow = getComputedStyle(document.documentElement).overflow
  scrollDiagnosticsText.value = [
    `body.className: ${body.className || '(空)'}`,
    `body.style.overflow: ${body.style.overflow || '(空)'}`,
    `html computed overflow: ${htmlOverflow}`,
    frame
      ? `frame scrollTop/scrollHeight/clientHeight: ${frame.scrollTop} / ${frame.scrollHeight} / ${frame.clientHeight}`
      : 'frame: 未找到 .route-page-frame',
  ].join('\n')
}

onMounted(() => {
  updateScrollDiagnostics()
  scrollDiagnosticsTimer = window.setInterval(updateScrollDiagnostics, 800)
})

onBeforeUnmount(() => {
  window.clearInterval(scrollDiagnosticsTimer)
})

const displayTypeOptions = [
  { value: 'income_expense', label: '收入与支出' },
  { value: 'expense', label: '仅支出' },
] as const

const summaryRangeOptions = [
  { value: 'week', label: '本周' },
  { value: '7d', label: '最近 7 日' },
  { value: '15d', label: '最近 15 日' },
  { value: 'hidden', label: '不显示' },
] as const

const themeOptions = [
  { value: 'green', label: '松石绿' },
  { value: 'blue', label: '晴空蓝' },
] as const

const appearanceOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
] as const

const accountOptions = computed(() => [
  { value: '', label: '自动选择' },
  ...accounts.value.map((a) => ({ value: a.id, label: a.name })),
])

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
  { label: 'AI 记账提示词', description: '复制提示词到豆包/AI，截图生成 JSON', icon: MessageSquare, route: 'ai-prompt' },
  { label: '待确认账单', description: '自动捕获的支付待确认', icon: Receipt, route: 'capture-inbox' },
  { label: '自动记账设置', description: '无障碍 / 通知监听 / 分享 OCR', icon: Scan, route: 'capture-settings' },
  { label: '备份与恢复', description: '完整本地备份', icon: DatabaseBackup, route: 'backup' },
  { label: '导出账单', description: 'CSV 或 JSON', icon: Download, route: 'export' },
] as const

const debugEntries = [
  { label: '诊断日志', description: '查看剪贴板检测、导入流程等运行记录', icon: Bug, route: 'app-logs' },
  { label: '匹配规则', description: '自动记账的页面识别模板', icon: ScrollText, route: 'capture-rules' },
] as const

// 读屏测试（诊断工具）：悬浮按钮抓取当前屏幕的无障碍节点树
const readerDebugEnabled = ref(false)
const readerDebugNotice = ref('')

async function onReaderDebugToggle(enabled: boolean): Promise<void> {
  try {
    const r = await PaymentCapture.setReaderDebugEnabled({ enabled })
    if (enabled && !r.granted) {
      readerDebugEnabled.value = false
      readerDebugNotice.value = '需要「显示在其他应用上层」权限，正在打开系统设置…'
      void PaymentCapture.openOverlaySettings()
      return
    }
    readerDebugNotice.value = r.showing ? '' : '悬浮窗权限未授予，按钮未显示'
  } catch {
    readerDebugNotice.value = '设置失败（仅原生环境可用）'
  }
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

function updateColorTheme(): void {
  document.documentElement.dataset.colorTheme = preferences.value.colorTheme
  void save()
}

function onDisplayTypeChange(value: string): void {
  preferences.value.summaryDisplayType = value as HomeSummaryDisplayType
  void save()
}

function onRangeTypeChange(value: string): void {
  preferences.value.summaryRangeType = value as HomeSummaryRangeType
  void save()
}

function onExpenseAccountChange(value: string): void {
  preferences.value.defaultExpenseAccountId = value
  void save()
}

function onIncomeAccountChange(value: string): void {
  preferences.value.defaultIncomeAccountId = value
  void save()
}

function onThemeChange(value: string): void {
  preferences.value.colorTheme = value as HomePreferences['colorTheme']
  updateColorTheme()
}

function onAppearanceChange(value: string): void {
  preferences.value.appearance = value as HomePreferences['appearance']
  void save()
}

function onRememberAccountChange(value: boolean): void {
  preferences.value.rememberLastAccount = value
  void save()
}

async function load(): Promise<void> {
  if (!preferencesService || !appStore.ledgerId) return
  ;[preferences.value, accounts.value] = await Promise.all([
    preferencesService.get(appStore.ledgerId),
    finance ? finance.listAccounts(appStore.ledgerId) : Promise.resolve([]),
  ])
}

onMounted(async () => {
  void load()
  try {
    const s = await PaymentCapture.getReaderDebugEnabled()
    readerDebugEnabled.value = s.enabled
    if (s.enabled && !s.overlayGranted) {
      readerDebugNotice.value = '悬浮窗权限未授予，按钮未显示'
    }
  } catch {
    // web 环境或原生不可用：保持关闭
  }
})
</script>

<template>
  <main class="settings-page">
    <div class="safe-top"><AppTopBar title="设置" @back="router.back()" /></div>
    <div class="content">
      <SettingsSection title="首页展示">
        <BaseCard class="settings-card">
          <AppSelect
            v-model="preferences.summaryDisplayType"
            label="最近汇总类型"
            description="首页图表展示的数据"
            :options="displayTypeOptions"
            @change="onDisplayTypeChange"
          />
          <AppSelect
            v-model="preferences.summaryRangeType"
            label="最近汇总范围"
            description="选择不显示后卡片会隐藏"
            :options="summaryRangeOptions"
            @change="onRangeTypeChange"
          />
        </BaseCard>
      </SettingsSection>
      <SettingsSection title="记账设置">
        <BaseCard class="settings-card">
          <AppSelect
            v-model="preferences.defaultExpenseAccountId"
            label="默认支出账户"
            description="新建支出时优先选择"
            :options="accountOptions"
            @change="onExpenseAccountChange"
          />
          <AppSelect
            v-model="preferences.defaultIncomeAccountId"
            label="默认收入账户"
            description="新建收入时优先选择"
            :options="accountOptions"
            @change="onIncomeAccountChange"
          />
          <AppSwitch
            v-model="preferences.rememberLastAccount"
            label="记住上次使用账户"
            description="优先于默认账户"
            @change="onRememberAccountChange"
          />
        </BaseCard>
      </SettingsSection>
      <SettingsSection title="外观">
        <BaseCard class="settings-card">
          <AppSelect
            v-model="preferences.colorTheme"
            label="主题色"
            description="全局使用绿色或蓝色界面"
            :options="themeOptions"
            @change="onThemeChange"
          />
          <AppSelect
            v-model="preferences.appearance"
            label="明暗模式"
            description="跟随系统或固定明暗模式"
            :options="appearanceOptions"
            @change="onAppearanceChange"
          />
        </BaseCard>
        <BaseCard class="entry-card">
          <button type="button" @click="router.push({ name: 'account-icons' })">
            <span class="entry-icon"><Images :size="20" /></span>
            <span><strong>账户图标管理</strong><small>为已有账户自行替换图标</small></span>
            <ChevronRight :size="19" />
          </button>
        </BaseCard>
      </SettingsSection>
      <SettingsSection title="账本与数据">
        <BaseCard class="entry-card">
          <button
            v-for="entry in entries"
            :key="entry.route"
            type="button"
            @click="router.push({ name: entry.route })"
          >
            <span class="entry-icon"><component :is="entry.icon" :size="20" /></span>
            <span>
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.description }}</small>
            </span>
            <ChevronRight :size="19" />
          </button>
        </BaseCard>
      </SettingsSection>
      <SettingsSection title="诊断">
        <BaseCard class="settings-card">
          <AppSwitch
            v-model="readerDebugEnabled"
            label="读屏测试"
            description="显示悬浮按钮，抓取当前屏幕的读屏内容（纯只读诊断）"
            @change="onReaderDebugToggle"
          />
          <p v-if="readerDebugNotice" class="reader-notice">{{ readerDebugNotice }}</p>
          <button
            type="button"
            class="reader-entry"
            @click="router.push({ name: 'screen-reader-test' })"
          >
            <span>查看最近一次抓取结果</span>
            <ChevronRight :size="18" :stroke-width="1.75" aria-hidden="true" />
          </button>
        </BaseCard>
        <BaseCard class="entry-card">
          <button
            v-for="entry in debugEntries"
            :key="entry.route"
            type="button"
            @click="router.push({ name: entry.route })"
          >
            <span class="entry-icon"><component :is="entry.icon" :size="20" /></span>
            <span>
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.description }}</small>
            </span>
            <ChevronRight :size="19" />
          </button>
        </BaseCard>
        <BaseCard class="settings-card scroll-diagnostics">
          <details>
            <summary>滚动锁取证（临时）</summary>
            <pre>{{ scrollDiagnosticsText }}</pre>
          </details>
        </BaseCard>
      </SettingsSection>
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
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-6);
}
.entry-card {
  padding: 0 var(--space-4);
}
.settings-card {
  padding: var(--space-2) var(--space-4);
}
.entry-card button {
  display: grid;
  width: 100%;
  min-height: 56px;
  grid-template-columns: 40px 1fr 20px;
  align-items: center;
  gap: var(--space-3);
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border-top: 1px solid var(--color-divider);
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
}
.entry-card button:first-child {
  border-top: 0;
}
.entry-card button > span:nth-child(2) {
  display: grid;
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
.settings-card small,
.entry-card small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.privacy-note {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}
.reader-notice {
  margin: 0;
  color: var(--color-warning);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}
.scroll-diagnostics summary {
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.scroll-diagnostics pre {
  margin: var(--space-2) 0 0;
  overflow-x: auto;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.reader-entry {
  display: flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  text-align: left;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--color-divider);
}
.reader-entry svg {
  color: var(--color-text-tertiary);
}
</style>