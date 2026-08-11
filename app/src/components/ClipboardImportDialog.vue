<script setup lang="ts">
import { ClipboardPaste, X } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { computed, watch } from 'vue'

import BaseCard from '@/components/BaseCard.vue'
import { useClipboardImportStore } from '@/stores/clipboard-import'

const router = useRouter()
const store = useClipboardImportStore()

const visible = computed(() => store.dialogVisible && Boolean(store.current))
const count = computed(() => store.current?.count ?? 0)

/**
 * 用户点「立即导入」：
 * 1. 调用 store.confirm() 关闭弹窗但保留候选项文本
 * 2. 跳转到导入页（ImportView 会在 onMounted 时读取 store.current 并自动填入）
 */
async function onConfirm(): Promise<void> {
  store.confirm()
  await router.push({ name: 'import' })
}

/** 用户点「暂不导入」：标记为已处理，本次内容不再弹窗。 */
function onDismiss(): Promise<void> {
  return store.ignore()
}

/**
 * 弹窗显示时锁住背景滚动，避免误触底层页面。
 * 这里用 watch + body overflow 控制。
 */
watch(visible, (v) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = v ? 'hidden' : ''
  }
})
</script>

<template>
  <Transition name="dialog-fade">
    <div v-if="visible" class="dialog-overlay" role="dialog" aria-modal="true">
      <BaseCard class="dialog-card">
        <button
          type="button"
          class="dialog-card__close"
          aria-label="关闭"
          @click="onDismiss"
        >
          <X :size="18" :stroke-width="1.75" />
        </button>
        <div class="dialog-card__icon">
          <ClipboardPaste :size="36" :stroke-width="1.5" />
        </div>
        <strong class="dialog-card__title">检测到待导入账单</strong>
        <p class="dialog-card__desc">
          剪贴板中有 <em>{{ count }}</em> 条交易记录，是否立即导入？
        </p>
        <div class="dialog-card__actions">
          <button type="button" class="secondary-button" @click="onDismiss">
            暂不导入
          </button>
          <button type="button" class="primary-button" @click="onConfirm">
            立即导入
          </button>
        </div>
      </BaseCard>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: var(--page-gutter);
  background: rgba(20, 22, 24, 0.45);
  backdrop-filter: blur(2px);
}

.dialog-card {
  position: relative;
  width: 100%;
  max-width: 360px;
  padding: var(--space-6) var(--space-5) var(--space-5);
  display: grid;
  gap: var(--space-3);
  place-items: center;
  text-align: center;
}

.dialog-card__close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--color-text-tertiary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
}

.dialog-card__icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  color: var(--color-primary-600);
  background: var(--color-primary-50);
  border-radius: 50%;
}

.dialog-card__title {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.dialog-card__desc {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}

.dialog-card__desc em {
  color: var(--color-primary-600);
  font-style: normal;
  font-weight: 700;
}

.dialog-card__actions {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.primary-button {
  display: flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: #fff;
  font-size: var(--type-body-size);
  font-weight: 600;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.secondary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 48px;
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.18s var(--ease-emphasized);
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
