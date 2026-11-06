<script setup lang="ts">
import {
  nextTick,
  onActivated,
  onDeactivated,
  provide,
  readonly,
  ref,
  type Component,
} from 'vue'

import {
  routePageActiveKey,
  routePageScrollRestoreKey,
} from '@/composables/routePageActivation'

defineProps<{
  viewComponent: Component
  containedScroll?: boolean
}>()

const active = ref(true)
const frame = ref<HTMLElement>()
const scrollPositions = new Map<HTMLElement, { left: number; top: number }>()
let restoreSequence = 0

provide(routePageActiveKey, readonly(active))

function rememberScrollPosition(event: Event): void {
  const element = event.target
  if (!(element instanceof HTMLElement) || element === frame.value) return
  if (element.scrollTop === 0 && element.scrollLeft === 0) {
    // 滚回顶部视为没有位置需要恢复（PRD BUG-13：不再全量遍历/强复位内层容器）
    scrollPositions.delete(element)
    return
  }
  scrollPositions.set(element, { left: element.scrollLeft, top: element.scrollTop })
}

/** 只记录帧根节点；内层容器由 scroll 捕获阶段在实际滚动过时登记，不做全量遍历。 */
function captureScrollPositions(): void {
  const root = frame.value
  if (!root) return
  scrollPositions.set(root, { left: root.scrollLeft, top: root.scrollTop })
}

function restoreScrollPositions(): void {
  // 注意：不做 isConnected 过滤——KeepAlive 缓存的子树在换页瞬间处于脱离状态，
  // 对它写回 scrollTop 恰恰是恢复语义本身；实例销毁时整张 Map 随之回收。
  for (const [element, position] of scrollPositions) {
    element.scrollLeft = position.left
    element.scrollTop = position.top
  }
}

function requestScrollRestore(): void {
  const sequence = ++restoreSequence
  restoreScrollPositions()
  void nextTick().then(() => {
    if (!active.value || sequence !== restoreSequence) return
    restoreScrollPositions()
  })
}

provide(routePageScrollRestoreKey, requestScrollRestore)

onActivated(() => {
  active.value = true
  requestScrollRestore()
})
onDeactivated(() => {
  captureScrollPositions()
  restoreSequence += 1
  active.value = false
})
</script>

<template>
  <div
    ref="frame"
    class="route-page-frame"
    :class="{ 'route-page-frame--contained-scroll': containedScroll }"
    @scroll.capture="rememberScrollPosition"
  >
    <div class="route-page-slide">
      <component :is="viewComponent" />
    </div>
  </div>
</template>
