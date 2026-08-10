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
  if (!(element instanceof HTMLElement)) return
  scrollPositions.set(element, { left: element.scrollLeft, top: element.scrollTop })
}

function captureScrollPositions(): void {
  const root = frame.value
  if (!root) return
  const elements = [root, ...root.querySelectorAll<HTMLElement>('*')]
  for (const element of elements) {
    if (
      element === root ||
      element.scrollTop !== 0 ||
      element.scrollLeft !== 0 ||
      element.scrollHeight > element.clientHeight ||
      element.scrollWidth > element.clientWidth
    ) {
      scrollPositions.set(element, { left: element.scrollLeft, top: element.scrollTop })
    }
  }
}

function restoreScrollPositions(): void {
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
    <component :is="viewComponent" />
  </div>
</template>
