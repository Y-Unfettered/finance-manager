<script setup lang="ts">
import { X } from '@lucide/vue'
import { computed, nextTick, watch } from 'vue'
import { useCaptureEntryStore } from '@/stores/capture-entry'
import CategoryIcon from '@/components/CategoryIcon.vue'
import AccountBrandIcon from '@/components/AccountBrandIcon.vue'
import { findAccountCatalogItem } from '@/features/finance/account-catalog'
import { formatMinorToCny } from '@/domain/money'
import MoneyText from '@/components/MoneyText.vue'

const store = useCaptureEntryStore()

const isDismissDisabled = computed(() => store.confirming)
const isConfirmDisabled = computed(
  () => store.confirming || !store.accountId || !store.categoryId || store.amountMinor <= 0,
)

/** 账户外观信息。 */
function appearance(acc: { name: string; institution?: string }) {
  return findAccountCatalogItem(acc.name, acc.institution)
}

/** 监听弹窗打开，确保账户列表已加载。 */
watch(
  () => store.visible,
  (visible) => {
    if (visible) {
      void nextTick(() => {
        void store.loadOptions()
      })
    }
  },
)

function onDismiss(): void {
  if (isDismissDisabled.value) return
  void store.dismissEvent()
}

function onConfirm(): void {
  if (isConfirmDisabled.value) return
  void store.doConfirm()
}

function onClose(): void {
  store.hideEntry()
}

function retryLoad(): void {
  store.message = ''
  void store.loadOptions()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.visible" class="capture-entry-overlay" @click.self="onDismiss">
      <div class="capture-entry">
        <!-- 拖拽条 -->
        <div class="capture-entry__drag" aria-hidden="true" />

        <div class="capture-entry__header">
          <h2>自动捕获账单</h2>
          <button type="button" class="capture-entry__close" aria-label="忽略" @click="onDismiss">
            <X :size="20" :stroke-width="2" />
          </button>
        </div>

        <div class="capture-entry__body">
          <!-- 金额 + 商户 -->
          <div class="entry-amount-row">
            <MoneyText :amount-minor="store.amountMinor" class="entry-amount" />
            <span class="entry-merchant">{{ store.note || '—' }}</span>
          </div>

          <!-- 来源标识 -->
          <div v-if="store.current?.sourceName" class="entry-source">
            <span class="entry-source__tag">{{ store.current.sourceName }}</span>
            <span v-if="store.suggestedCategory" class="entry-source__suggestion">
              建议分类：{{ store.suggestedCategory.label }}
            </span>
          </div>

          <!-- 加载中提示 -->
          <p v-if="store.loading" class="entry-loading">正在加载账户与分类…</p>

          <!-- 分类选择 -->
          <section v-if="!store.loading" class="entry-section">
            <span class="entry-section__label">支出分类</span>
            <div v-if="store.message && !store.categories.length" class="entry-retry" @click="retryLoad">
              {{ store.message || '加载失败，点此重试' }}
            </div>
            <div class="entry-categories">
              <button
                v-for="cat in store.categories.slice(0, 10)"
                :key="cat.id"
                type="button"
                :class="['entry-cat', { active: store.categoryId === cat.id }]"
                @click="store.categoryId = cat.id"
              >
                <CategoryIcon
                  :icon-key="cat.iconKey"
                  color="var(--color-primary-500)"
                  :size="28"
                  :label="cat.name"
                />
                <span class="entry-cat__label">{{ cat.name }}</span>
              </button>
            </div>
          </section>

          <!-- 账户选择 -->
          <section class="entry-section">
            <span class="entry-section__label">付款账户</span>
            <div class="entry-accounts">
              <button
                v-for="acc in store.accounts.slice(0, 8)"
                :key="acc.id"
                type="button"
                :class="['entry-account', { active: store.accountId === acc.id }]"
                @click="store.accountId = acc.id"
              >
                <AccountBrandIcon
                  :label="acc.name"
                  :brand-key="acc.brandKey ?? appearance(acc).id"
                  :symbol="acc.iconKey ?? appearance(acc).symbol"
                  :color="acc.color ?? appearance(acc).color"
                  :size="'small'"
                />
                <div class="entry-account__info">
                  <span class="entry-account__name">{{ acc.name }}</span>
                  <span class="entry-account__balance">{{
                    formatMinorToCny(acc.balanceMinor)
                  }}</span>
                </div>
              </button>
            </div>
          </section>

          <!-- 操作按钮 -->
          <div class="entry-actions">
            <button
              class="entry-btn entry-btn--dismiss"
              :disabled="isDismissDisabled"
              @click="onDismiss"
            >
              忽略
            </button>
            <button
              class="entry-btn entry-btn--confirm"
              :disabled="isConfirmDisabled"
              @click="onConfirm"
            >
              <template v-if="store.confirming">入账中…</template>
              <template v-else>确认入账</template>
            </button>
          </div>

          <!-- 状态消息 -->
          <p v-if="store.message" class="entry-message" :class="store.message === '入账成功' ? 'entry-message--success' : 'entry-message--error'">
            {{ store.message }}
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.capture-entry-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 40%);
}

.capture-entry {
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--color-surface);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgb(0 0 0 / 12%);
}

.capture-entry__drag {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
}

.capture-entry__drag::before {
  content: '';
  width: 36px;
  height: 4px;
  background: var(--color-divider);
  border-radius: 2px;
}

.capture-entry__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px var(--space-4) 12px;
  border-bottom: 1px solid var(--color-divider);
}

.capture-entry__header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.capture-entry__close {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--color-text-secondary);
  background: var(--color-background);
  border: 0;
  border-radius: 50%;
}

.capture-entry__body {
  padding: var(--space-4) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
}

.entry-amount-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-divider);
}

.entry-amount {
  font-size: 30px;
  font-weight: 600;
}

.entry-merchant {
  color: var(--color-text-secondary);
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.entry-source {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  flex-wrap: wrap;
}

.entry-source__tag {
  padding: 3px 10px;
  color: var(--color-primary-700);
  font-size: 12px;
  font-weight: 500;
  background: var(--color-primary-50);
  border: 1px solid var(--color-primary-200);
  border-radius: var(--radius-pill);
}

.entry-source__suggestion {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.entry-section {
  margin-bottom: var(--space-4);
}

.entry-section__label {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--color-text-tertiary);
  font-size: 13px;
  font-weight: 500;
  padding-left: 2px;
}

.entry-categories {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px var(--space-2);
}

.entry-cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-1) 2px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.entry-cat.active {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.entry-cat:active {
  transform: scale(0.95);
}

.entry-cat__label {
  color: var(--color-text-secondary);
  font-size: 11px;
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.entry-cat.active .entry-cat__label {
  color: var(--color-primary-700);
  font-weight: 600;
}

.entry-accounts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.entry-account {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: var(--space-2) 2px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.entry-account.active {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}

.entry-account:active {
  transform: scale(0.95);
}

.entry-account--more {
  color: var(--color-text-tertiary);
}

.entry-account__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  width: 100%;
}

.entry-account__name {
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.entry-account__balance {
  color: var(--color-text-tertiary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.entry-actions {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.entry-btn {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  border-radius: 12px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.entry-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.entry-btn--dismiss {
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
}

.entry-btn--confirm {
  color: white;
  background: var(--color-primary-600);
  border: 0;
}

.entry-message {
  margin: var(--space-2) 0 0;
  font-size: var(--type-caption-size);
  text-align: center;
  line-height: 1.4;
}

.entry-message--success {
  color: var(--color-success);
}

.entry-message--error {
  color: var(--color-danger);
}

.entry-loading {
  margin: 0 0 var(--space-3);
  font-size: 13px;
  color: var(--color-text-tertiary);
  text-align: center;
}

.entry-retry {
  padding: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: 13px;
  color: var(--color-primary-600);
  text-align: center;
  background: var(--color-primary-50);
  border-radius: 8px;
  cursor: pointer;
}
</style>