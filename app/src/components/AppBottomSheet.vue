<script setup lang="ts">
// AI署名: 豆包 | 2026-11-08 | 新增可选 minHeight（默认 240px 不变），供短确认面板按内容收缩
import { X } from '@lucide/vue'
import { Popup } from 'vant'
import { computed, watch } from 'vue'
import 'vant/es/popup/style'

import { usePageScrollLock } from '@/composables/usePageScrollLock'
import { useRoutePageActive } from '@/composables/routePageActivation'

const props = withDefaults(
  defineProps<{
    show: boolean
    title: string
    /** 面板最小高度；短内容面板（如删除确认）传 0，让高度随内容收缩，避免按钮下方留白 */
    minHeight?: number
  }>(),
  { minHeight: 240 },
)

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const pageActive = useRoutePageActive()
const visible = computed(() => props.show && pageActive.value)
/** 用 CSS 变量下发最小高度，避免各调用处都要感知样式实现 */
const sheetStyle = computed(() => `--sheet-min-height: ${props.minHeight}px`)

// PRD BUG-02：不再用 Vant 的 body 锁（与本应用真实滚动容器不一致，会泄漏），
// 统一锁 .route-page-frame，引用计数、失活/卸载强制释放
usePageScrollLock(visible)

// 页面失活时重置 show，避免返回页面后弹层"复活"、滚动锁叠加
watch(pageActive, (activePage) => {
  if (!activePage && props.show) emit('update:show', false)
})
</script>

<template>
  <Popup
    :show="visible"
    teleport="body"
    position="bottom"
    round
    safe-area-inset-bottom
    :lock-scroll="false"
    class="app-bottom-sheet"
    :style="sheetStyle"
    @update:show="$emit('update:show', $event)"
  >
    <div class="app-bottom-sheet__header">
      <h2>{{ title }}</h2>
      <div class="app-bottom-sheet__actions">
        <slot name="actions" />
        <button
          type="button"
          class="app-bottom-sheet__close"
          aria-label="关闭"
          @click="$emit('update:show', false)"
        >
          <X :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="app-bottom-sheet__body">
      <slot />
    </div>
  </Popup>
</template>

<style scoped>
.app-bottom-sheet {
  min-height: var(--sheet-min-height, 240px);
  color: var(--color-text-primary);
  background: var(--color-surface);
}

.app-bottom-sheet__header {
  display: flex;
  min-height: 56px;
  padding: 0 10px 0 var(--space-4);
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-divider);
}

.app-bottom-sheet__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.app-bottom-sheet__actions :deep(button),
.app-bottom-sheet__close {
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  place-items: center;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: 50%;
}

.app-bottom-sheet__actions :deep(button:active),
.app-bottom-sheet__close:active {
  background: var(--color-background);
}

.app-bottom-sheet__actions :deep(button:disabled) {
  opacity: 0.32;
}

.app-bottom-sheet__actions :deep(button.detail-header-danger) {
  color: var(--color-danger);
}

.app-bottom-sheet__header h2 {
  margin: 0;
  font-size: var(--type-section-title-size);
  font-weight: 600;
  line-height: var(--type-section-title-line);
}

.app-bottom-sheet__body {
  padding: var(--space-4);
}
</style>
