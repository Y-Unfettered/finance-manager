<script setup lang="ts">
import {
  CircleCheck,
  DatabaseBackup,
  Download,
  FileUp,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import { useBackupService } from '@/features/backup/backup-service'
import type { BackupTableName, RestoreResult } from '@/features/backup/backup-types'
import { useRestoreService, type RestoreOutcome } from '@/features/backup/restore-service'
import { useAppStore } from '@/stores/app'
import { readFileAsText, saveTextFile } from '@/utils/file-io'

type RestoreSuccess = Extract<RestoreResult, { ok: true }>

const DISPLAY_TABLES: readonly BackupTableName[] = [
  'ledgers',
  'accounts',
  'categories',
  'import_batches',
  'transactions',
  'entries',
  'receivables',
  'payables',
] as const

const TABLE_LABELS: Partial<Record<BackupTableName, string>> = {
  schema_migrations: '数据库版本',
  ledgers: '账本',
  accounts: '账户',
  categories: '分类',
  import_batches: '导入批次',
  transactions: '交易',
  entries: '流水明细',
  receivables: '应收（借出）',
  payables: '借入',
}

const router = useRouter()
const appStore = useAppStore()
const backup = useBackupService()
const restoreService = useRestoreService()

const isReady = computed(() => appStore.databaseStatus === 'ready' && !!backup && !!restoreService)

// 创建备份
const creating = ref(false)
const createMessage = ref('')
const createError = ref('')

// 选择文件 + 校验
const verifying = ref(false)
const verifyError = ref('')
const pendingJson = ref('')
const pendingVerification = ref<RestoreResult | undefined>(undefined)
const showConfirm = ref(false)

// 执行恢复
const restoring = ref(false)
const restoreError = ref('')
const restoreOutcome = ref<RestoreOutcome | undefined>(undefined)
const rollbackSaved = ref(false)

// 当前数据概览
const counts = ref<Record<BackupTableName, number> | undefined>(undefined)
const countsLoading = ref(false)
const countsError = ref('')

const verificationSummary = computed<RestoreSuccess | undefined>(() => {
  const v = pendingVerification.value
  return v && v.ok ? v : undefined
})

const restoreSuccess = computed<RestoreSuccess | undefined>(() => {
  const outcome = restoreOutcome.value
  return outcome && outcome.result.ok ? outcome.result : undefined
})

const restoreSuccessMessage = computed(() => {
  const s = restoreSuccess.value
  return s ? `恢复成功，共写入 ${s.totalRestored} 条记录。` : ''
})

const rollbackAvailable = computed(() => !!restoreOutcome.value?.preRestoreBackup)

async function createBackup(): Promise<void> {
  if (!backup || creating.value) return
  creating.value = true
  createError.value = ''
  createMessage.value = ''
  try {
    const json = await backup.createBackupJson()
    const fileName = `finance-backup-${formatStamp(new Date(), true)}.json`
    const result = await saveTextFile(fileName, json, 'application/json')
    createMessage.value = result.downloaded
      ? `已通过浏览器下载：${result.fileName}`
      : `已生成备份文件：${result.fileName}${result.location ? `（${result.location}）` : ''}`
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error)
  } finally {
    creating.value = false
  }
}

async function onFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !backup) return
  // 重置以便同一文件可再次选择
  target.value = ''
  verifying.value = true
  verifyError.value = ''
  pendingJson.value = ''
  pendingVerification.value = undefined
  try {
    const json = await readFileAsText(file)
    const result = await backup.verifyBackupJson(json)
    if (!result.ok) {
      verifyError.value = result.message
      return
    }
    pendingJson.value = json
    pendingVerification.value = result
    showConfirm.value = true
  } catch (error) {
    verifyError.value = error instanceof Error ? error.message : String(error)
  } finally {
    verifying.value = false
  }
}

function cancelRestore(): void {
  showConfirm.value = false
  pendingJson.value = ''
  pendingVerification.value = undefined
  restoreError.value = ''
}

async function confirmRestore(): Promise<void> {
  if (!restoreService || !pendingJson.value || restoring.value) return
  restoring.value = true
  restoreError.value = ''
  try {
    const outcome = await restoreService.restoreFromJson(pendingJson.value)
    restoreOutcome.value = outcome
    rollbackSaved.value = false
    if (!outcome.result.ok) {
      restoreError.value = outcome.result.message
      return
    }
    showConfirm.value = false
    pendingJson.value = ''
    pendingVerification.value = undefined
    await loadCounts()
  } catch (error) {
    restoreError.value = error instanceof Error ? error.message : String(error)
  } finally {
    restoring.value = false
  }
}

async function saveRollback(): Promise<void> {
  const json = restoreOutcome.value?.preRestoreBackup
  if (!json || rollbackSaved.value) return
  try {
    const fileName = `finance-backup-pre-restore-${formatStamp(new Date(), true)}.json`
    await saveTextFile(fileName, json, 'application/json')
    rollbackSaved.value = true
  } catch (error) {
    restoreError.value = error instanceof Error ? error.message : String(error)
  }
}

async function loadCounts(): Promise<void> {
  if (!backup) return
  countsLoading.value = true
  countsError.value = ''
  try {
    counts.value = await backup.countCurrent()
  } catch (error) {
    countsError.value = error instanceof Error ? error.message : String(error)
  } finally {
    countsLoading.value = false
  }
}

function formatStamp(date: Date, withTime: boolean): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  return withTime ? `${datePart}-${pad(date.getHours())}${pad(date.getMinutes())}` : datePart
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

onMounted(loadCounts)
</script>

<template>
  <main class="backup-page">
    <div class="backup-page__safe-top">
      <AppTopBar title="备份与恢复" @back="router.back()" />
    </div>

    <div class="backup-page__content">
      <div v-if="!isReady" class="page-state">数据库尚未就绪，备份与恢复功能暂不可用。</div>

      <template v-else>
        <section class="block">
          <h2>创建完整备份</h2>
          <BaseCard class="block-card">
            <div class="block-head">
              <span class="block-icon">
                <DatabaseBackup :size="20" :stroke-width="1.75" aria-hidden="true" />
              </span>
              <div class="block-text">
                <strong>生成完整备份包</strong>
                <small>生成包含所有账本数据的 JSON 备份包，可用于在空库恢复。</small>
              </div>
            </div>
            <button class="primary-button" type="button" :disabled="creating" @click="createBackup">
              <LoaderCircle v-if="creating" :size="18" :stroke-width="2" class="spin" />
              <Download v-else :size="18" :stroke-width="1.75" />
              {{ creating ? '正在生成…' : '生成备份文件' }}
            </button>
            <div v-if="createMessage" class="result-message result-message--ok">
              <CircleCheck :size="18" :stroke-width="1.75" />
              <span>{{ createMessage }}</span>
            </div>
            <div v-if="createError" class="result-message result-message--error">
              <TriangleAlert :size="18" :stroke-width="1.75" />
              <span>{{ createError }}</span>
            </div>
          </BaseCard>
        </section>

        <section class="block">
          <h2>从备份恢复</h2>
          <BaseCard class="block-card">
            <div class="block-head">
              <span class="block-icon block-icon--danger">
                <RotateCcw :size="20" :stroke-width="1.75" aria-hidden="true" />
              </span>
              <div class="block-text">
                <strong>覆盖当前数据</strong>
                <small class="block-text--warning">
                  恢复会覆盖当前所有数据，操作前会自动生成一份当前数据的备份。
                </small>
              </div>
            </div>
            <label class="secondary-button file-picker" :class="{ 'file-picker--busy': verifying }">
              <LoaderCircle v-if="verifying" :size="18" :stroke-width="2" class="spin" />
              <FileUp v-else :size="18" :stroke-width="1.75" />
              <span>{{ verifying ? '正在校验…' : '选择备份文件' }}</span>
              <input
                type="file"
                accept=".json,application/json"
                hidden
                :disabled="verifying || restoring"
                @change="onFileChange"
              />
            </label>
            <div v-if="verifyError" class="result-message result-message--error">
              <TriangleAlert :size="18" :stroke-width="1.75" />
              <span>{{ verifyError }}</span>
            </div>
            <div v-if="restoreError && !showConfirm" class="result-message result-message--error">
              <TriangleAlert :size="18" :stroke-width="1.75" />
              <span>{{ restoreError }}</span>
            </div>
            <div v-if="restoreSuccessMessage" class="result-message result-message--ok">
              <CircleCheck :size="18" :stroke-width="1.75" />
              <div class="result-message__body">
                <span>{{ restoreSuccessMessage }}</span>
                <button
                  v-if="rollbackAvailable"
                  class="secondary-button rollback-button"
                  type="button"
                  :disabled="rollbackSaved"
                  @click="saveRollback"
                >
                  <Download :size="16" :stroke-width="1.75" />
                  {{ rollbackSaved ? '恢复前备份已保存' : '保存恢复前备份' }}
                </button>
                <small class="result-hint">如需回滚，可使用恢复前自动生成的备份。</small>
              </div>
            </div>
          </BaseCard>
        </section>

        <section class="block">
          <h2>当前数据概览</h2>
          <BaseCard class="block-card">
            <div v-if="countsLoading" class="counts-state">正在读取…</div>
            <div v-else-if="countsError" class="counts-state counts-state--error">
              {{ countsError }}
            </div>
            <dl v-else-if="counts" class="counts-list">
              <div v-for="table in DISPLAY_TABLES" :key="table">
                <dt>{{ TABLE_LABELS[table] }}</dt>
                <dd>{{ counts[table] }}</dd>
              </div>
            </dl>
          </BaseCard>
        </section>

        <section class="block block--note">
          <ShieldCheck :size="18" :stroke-width="1.75" aria-hidden="true" />
          <span>所有备份仅保存在本机，建议定期生成备份并妥善保管。</span>
        </section>
      </template>
    </div>

    <AppBottomSheet v-model:show="showConfirm" title="确认恢复">
      <div v-if="verificationSummary" class="confirm-dialog">
        <div class="confirm-summary">
          <div>
            <span>备份创建于</span>
            <strong>{{ formatDateTime(verificationSummary.backupCreatedAt) }}</strong>
          </div>
          <div>
            <span>记录总数</span>
            <strong>{{ verificationSummary.totalRestored }} 条</strong>
          </div>
          <div>
            <span>数据版本</span>
            <strong>schema v{{ verificationSummary.schemaVersion }}</strong>
          </div>
        </div>
        <ul class="confirm-counts">
          <li v-for="table in DISPLAY_TABLES" :key="table">
            <span>{{ TABLE_LABELS[table] }}</span>
            <span>{{ verificationSummary.restoredCounts[table] }}</span>
          </li>
        </ul>
        <p class="confirm-warning">
          <TriangleAlert :size="16" :stroke-width="1.75" />
          恢复将清空并替换当前所有数据，操作不可撤销。
        </p>
        <div v-if="restoreError" class="result-message result-message--error">
          <TriangleAlert :size="18" :stroke-width="1.75" />
          <span>{{ restoreError }}</span>
        </div>
        <div class="confirm-dialog__actions">
          <button
            class="secondary-button"
            type="button"
            :disabled="restoring"
            @click="cancelRestore"
          >
            取消
          </button>
          <button class="danger-button" type="button" :disabled="restoring" @click="confirmRestore">
            <LoaderCircle v-if="restoring" :size="18" :stroke-width="2" class="spin" />
            {{ restoring ? '正在恢复…' : '确认恢复' }}
          </button>
        </div>
      </div>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.backup-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-10) + env(safe-area-inset-bottom));
  background: var(--color-background);
}
.backup-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.backup-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) var(--space-10);
  margin: auto;
  gap: var(--space-4);
}
.block {
  display: grid;
  gap: var(--space-3);
}
.block h2 {
  margin: var(--space-1) 0 0;
  font-size: var(--type-section-title-size);
}
.block-card {
  display: grid;
  gap: var(--space-3);
}
.block-head {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-3);
}
.block-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: var(--radius-pill);
}
.block-icon--danger {
  color: var(--color-danger);
  background: rgb(185 67 67 / 10%);
}
.block-text {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.block-text strong {
  font-size: var(--type-list-primary-size);
  font-weight: 600;
}
.block-text small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
.block-text--warning {
  color: var(--color-warning);
}
.primary-button,
.danger-button,
.secondary-button {
  display: flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: var(--type-body-size);
  font-weight: 600;
  border-radius: var(--radius-pill);
  cursor: pointer;
}
.primary-button {
  color: #fff;
  background: var(--color-primary-600);
  border: 0;
}
.danger-button {
  color: #fff;
  background: var(--color-danger);
  border: 0;
}
.secondary-button {
  color: var(--color-text-primary);
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--color-divider);
}
.primary-button:disabled,
.danger-button:disabled,
.secondary-button:disabled {
  opacity: 0.5;
}
.file-picker {
  cursor: pointer;
}
.file-picker--busy {
  opacity: 0.7;
}
.result-message {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  border-radius: var(--radius-control);
}
.result-message--ok {
  color: var(--color-income);
  background: var(--color-primary-50);
}
.result-message--ok svg {
  color: var(--color-income);
}
.result-message--error {
  color: var(--color-danger);
  background: rgb(185 67 67 / 8%);
}
.result-message--error svg {
  color: var(--color-danger);
}
.result-message__body {
  display: grid;
  min-width: 0;
  gap: var(--space-2);
}
.rollback-button {
  width: auto;
  height: 36px;
  padding: 0 var(--space-4);
  justify-self: start;
  font-size: var(--type-caption-size);
}
.result-hint {
  color: var(--color-text-tertiary);
}
.counts-list {
  display: grid;
  margin: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2) var(--space-4);
}
.counts-list div {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.counts-list dt {
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
}
.counts-list dd {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--type-list-amount-size);
  font-weight: 600;
}
.counts-state {
  padding: var(--space-3) 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
}
.counts-state--error {
  color: var(--color-danger);
}
.page-state {
  padding: var(--space-10) var(--space-4);
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
  text-align: center;
}
.block--note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.6;
}
.block--note svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--color-text-tertiary);
}
.confirm-dialog {
  display: grid;
  gap: var(--space-4);
}
.confirm-summary {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--color-background);
  border-radius: var(--radius-card);
}
.confirm-summary div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.confirm-summary span {
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
}
.confirm-summary strong {
  font-size: var(--type-body-size);
  font-weight: 600;
}
.confirm-counts {
  display: grid;
  margin: 0;
  padding: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2) var(--space-4);
  list-style: none;
}
.confirm-counts li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--type-caption-size);
}
.confirm-counts li > span:first-child {
  color: var(--color-text-tertiary);
}
.confirm-counts li > span:last-child {
  color: var(--color-text-primary);
  font-weight: 600;
}
.confirm-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-warning);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
.confirm-warning svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.confirm-dialog__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.spin {
  animation: backup-spin 0.9s linear infinite;
}
@keyframes backup-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
