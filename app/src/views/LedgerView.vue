<script setup lang="ts">
import { Archive, BookOpen, CheckCircle2, Pencil, Plus, RotateCcw } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import type { LedgerSummary } from '@/db/repositories/ledger-repository'
import { useLedgerService } from '@/features/ledger/ledger-service'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const service = useLedgerService()
const ledgers = ref<LedgerSummary[]>([])
const showEditor = ref(false)
const saving = ref(false)
const error = ref('')
const form = ref({ id: '', name: '' })

async function load(): Promise<void> {
  if (!service) return
  ledgers.value = await service.list()
}

function openCreate(): void {
  form.value = { id: '', name: '' }
  error.value = ''
  showEditor.value = true
}

function openRename(ledger: LedgerSummary): void {
  form.value = { id: ledger.id, name: ledger.name }
  error.value = ''
  showEditor.value = true
}

async function save(): Promise<void> {
  if (!service || saving.value) return
  saving.value = true
  error.value = ''
  try {
    if (form.value.id) {
      await service.rename(form.value.id, form.value.name)
      if (appStore.ledgerId === form.value.id)
        appStore.selectLedger(form.value.id, form.value.name.trim())
    } else {
      const ledger = await service.create(form.value.name)
      appStore.selectLedger(ledger.id, ledger.name)
    }
    showEditor.value = false
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

function select(ledger: LedgerSummary): void {
  if (ledger.archivedAt) return
  appStore.selectLedger(ledger.id, ledger.name)
  void router.replace({ name: 'home' })
}

async function toggleArchive(ledger: LedgerSummary): Promise<void> {
  if (!service) return
  if (!ledger.archivedAt && !confirm(`归档账本“${ledger.name}”？数据不会被删除。`)) return
  error.value = ''
  try {
    await service.setArchived(ledger.id, !ledger.archivedAt)
    if (appStore.ledgerId === ledger.id) {
      const replacement = (await service.list()).find((item) => !item.archivedAt)
      if (replacement) appStore.selectLedger(replacement.id, replacement.name)
    }
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(load)
</script>

<template>
  <main class="ledger-page">
    <div class="safe-top">
      <AppTopBar title="我的账本" @back="router.back()">
        <template #right>
          <button class="top-button" type="button" aria-label="新建账本" @click="openCreate">
            <Plus :size="22" />
          </button>
        </template>
      </AppTopBar>
    </div>
    <div class="content">
      <BaseCard
        v-for="ledger in ledgers"
        :key="ledger.id"
        class="ledger-card"
        :class="{ 'ledger-card--archived': ledger.archivedAt }"
      >
        <button class="ledger-card__main" type="button" @click="select(ledger)">
          <span class="ledger-icon"><BookOpen :size="26" aria-hidden="true" /></span>
          <span>
            <strong>{{ ledger.name }}</strong>
            <small>
              人民币 · {{ ledger.transactionCount }} 笔交易 · 创建于
              {{ ledger.createdAt.slice(0, 10) }}
            </small>
          </span>
          <CheckCircle2 v-if="appStore.ledgerId === ledger.id" :size="22" aria-label="当前账本" />
          <small v-else-if="ledger.archivedAt">已归档</small>
        </button>
        <div class="ledger-card__actions">
          <button type="button" @click="openRename(ledger)"><Pencil :size="16" />重命名</button>
          <button type="button" @click="toggleArchive(ledger)">
            <RotateCcw v-if="ledger.archivedAt" :size="16" />
            <Archive v-else :size="16" />
            {{ ledger.archivedAt ? '恢复' : '归档' }}
          </button>
        </div>
      </BaseCard>
      <p v-if="error" class="error">{{ error }}</p>
      <p class="hint">不同账本的账户、分类、预算和统计完全隔离；本版本不提供多人共享。</p>
    </div>
    <AppBottomSheet v-model:show="showEditor" :title="form.id ? '重命名账本' : '新建账本'">
      <form class="editor" @submit.prevent="save">
        <label><span>账本名称</span><input v-model="form.name" required maxlength="24" /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
      </form>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.ledger-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.top-button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-text-primary);
  background: transparent;
  border: 0;
}
.content {
  display: grid;
  max-width: 520px;
  padding: var(--space-5) var(--page-gutter);
  margin: auto;
  gap: var(--space-4);
}
.ledger-card {
  padding: 0;
  overflow: hidden;
}
.ledger-card--archived {
  opacity: 0.62;
}
.ledger-card__main {
  display: grid;
  width: 100%;
  min-height: 76px;
  padding: var(--space-3);
  grid-template-columns: 48px 1fr auto;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}
.ledger-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: 50%;
}
.ledger-card__main > span:nth-child(2) {
  display: grid;
}
.ledger-card small,
.hint {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.ledger-card__main > svg {
  color: var(--color-primary-600);
}
.ledger-card__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--color-divider);
}
.ledger-card__actions button {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-left: 1px solid var(--color-divider);
}
.ledger-card__actions button:first-child {
  border-left: 0;
}
.hint {
  margin: 0;
}
.error {
  margin: 0;
  color: var(--color-danger);
}
.editor {
  display: grid;
  gap: var(--space-4);
}
.editor label {
  display: grid;
  gap: var(--space-2);
}
.editor label > span {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}
.editor input {
  height: 46px;
  padding: 0 var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.editor > button {
  height: 48px;
  color: white;
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}
</style>
