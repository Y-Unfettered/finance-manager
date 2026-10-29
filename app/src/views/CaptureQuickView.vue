<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCaptureEntryStore } from '@/stores/capture-entry'
import CategoryIcon from '@/components/CategoryIcon.vue'
import AccountBrandIcon from '@/components/AccountBrandIcon.vue'
import { findAccountCatalogItem } from '@/features/finance/account-catalog'
import { formatMinorToCny } from '@/domain/money'
import { PaymentCapture } from '@/features/payment-capture/payment-capture-reader'

const route = useRoute()
const store = useCaptureEntryStore()

const pendingId = computed(() => Number(route.query.pendingId ?? -1))

const isConfirmDisabled = computed(
  () => store.confirming || !store.accountId || !store.categoryId || store.amountMinor <= 0,
)

function appearance(acc: { name: string; institution?: string }) {
  return findAccountCatalogItem(acc.name, acc.institution)
}

async function onConfirm() {
  if (isConfirmDisabled.value) return
  await store.doConfirm()
  if (store.message === '入账成功') {
    try {
      await PaymentCapture.onOverlayCommitDone({ success: true, message: `¥${(store.amountMinor / 100).toFixed(2)}` })
    } catch {}
    setTimeout(() => {
      try { (window as any).AndroidBridge?.finish?.() } catch {}
      window.close()
    }, 700)
  }
}

async function onDismiss() {
  await store.dismissEvent()
  try { await PaymentCapture.onOverlayCommitDone({ success: false, message: '已忽略' }) } catch {}
  setTimeout(() => window.close(), 200)
}

onMounted(async () => {
  if (pendingId.value > 0) {
    await store.loadPendingById(pendingId.value)
  }
})
</script>

<template>
  <div class="quick-page">
    <div class="quick-card">
      <header class="quick-header">
        <h2>记一笔</h2>
        <button class="quick-close" @click="onDismiss" aria-label="关闭">✕</button>
      </header>

      <div class="quick-body">
        <div class="quick-amount-row">
          <span class="quick-amount">¥{{ (store.amountMinor / 100).toFixed(2) }}</span>
          <span class="quick-merchant">{{ store.note || '—' }}</span>
        </div>

        <div v-if="store.current?.sourceName" class="quick-source">
          <span class="quick-tag">{{ store.current.sourceName }}</span>
        </div>

        <p v-if="store.loading" class="quick-loading">正在加载账户与分类…</p>
        <p v-else-if="store.message && !store.categories.length" class="quick-retry" @click="store.loadOptions()">
          {{ store.message || '加载失败，点此重试' }}
        </p>

        <section v-if="!store.loading" class="quick-section">
          <span class="quick-label">支出分类</span>
          <div class="quick-cats">
            <button
              v-for="cat in store.categories.slice(0, 12)"
              :key="cat.id"
              type="button"
              :class="['quick-cat', { active: store.categoryId === cat.id }]"
              @click="store.categoryId = cat.id"
            >
              <CategoryIcon :icon-key="cat.iconKey" color="#2563eb" :size="26" :label="cat.name" />
              <span class="quick-cat-label">{{ cat.name }}</span>
            </button>
          </div>
        </section>

        <section class="quick-section">
          <span class="quick-label">付款账户</span>
          <div class="quick-accounts">
            <button
              v-for="acc in store.accounts.slice(0, 8)"
              :key="acc.id"
              type="button"
              :class="['quick-acc', { active: store.accountId === acc.id }]"
              @click="store.accountId = acc.id"
            >
              <AccountBrandIcon
                :label="acc.name"
                :brand-key="acc.brandKey ?? appearance(acc).id"
                :symbol="acc.iconKey ?? appearance(acc).symbol"
                :color="acc.color ?? appearance(acc).color"
                :size="'small'"
              />
              <span class="quick-acc-name">{{ acc.name }}</span>
            </button>
          </div>
        </section>

        <div class="quick-actions">
          <button class="quick-btn quick-btn--ghost" :disabled="store.confirming" @click="onDismiss">忽略</button>
          <button class="quick-btn quick-btn--primary" :disabled="isConfirmDisabled" @click="onConfirm">
            {{ store.confirming ? '入账中…' : '✓ 记一笔' }}
          </button>
        </div>

        <p v-if="store.message" class="quick-msg" :class="{ ok: store.message === '入账成功' }">
          {{ store.message }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quick-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 45%);
  padding: 16px;
}
.quick-card {
  width: 100%;
  max-width: 420px;
  max-height: 92vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 10px 40px rgb(0 0 0 / 25%);
}
.quick-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #f0f0f0;
}
.quick-header h2 { margin: 0; font-size: 17px; font-weight: 600; color: #111827; }
.quick-close {
  width: 30px; height: 30px; border: 0; border-radius: 50%;
  background: #f3f4f6; color: #6b7280; font-size: 14px;
}
.quick-body { padding: 14px 16px calc(16px + env(safe-area-inset-bottom)); }
.quick-amount-row {
  display: flex; align-items: baseline; gap: 10px;
  padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid #f0f0f0;
}
.quick-amount { font-size: 28px; font-weight: 700; color: #111827; }
.quick-merchant { color: #6b7280; font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick-source { margin-bottom: 10px; }
.quick-tag {
  padding: 2px 8px; font-size: 12px; color: #1d4ed8;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 999px;
}
.quick-loading, .quick-retry { color: #6b7280; font-size: 13px; padding: 12px 0; }
.quick-retry { color: #dc2626; cursor: pointer; }
.quick-section { margin-bottom: 14px; }
.quick-label { display: block; font-size: 12px; color: #9ca3af; margin-bottom: 8px; }
.quick-cats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.quick-cat {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; border: 1.5px solid transparent; border-radius: 12px;
  background: #f9fafb; cursor: pointer;
}
.quick-cat.active { border-color: #2563eb; background: #eff6ff; }
.quick-cat-label { font-size: 11px; color: #374151; }
.quick-accounts { display: flex; flex-wrap: wrap; gap: 8px; }
.quick-acc {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border: 1.5px solid #e5e7eb; border-radius: 10px;
  background: #fff; cursor: pointer;
}
.quick-acc.active { border-color: #2563eb; background: #eff6ff; }
.quick-acc-name { font-size: 13px; color: #111827; }
.quick-actions { display: flex; gap: 10px; margin-top: 14px; }
.quick-btn {
  flex: 1; height: 46px; border: 0; border-radius: 12px;
  font-size: 15px; font-weight: 600; cursor: pointer;
}
.quick-btn--ghost { background: #f3f4f6; color: #374151; flex: 0 0 90px; }
.quick-btn--primary { background: #2563eb; color: #fff; }
.quick-btn:disabled { opacity: 0.5; }
.quick-msg { margin-top: 10px; font-size: 13px; color: #dc2626; text-align: center; }
.quick-msg.ok { color: #16a34a; }
</style>
