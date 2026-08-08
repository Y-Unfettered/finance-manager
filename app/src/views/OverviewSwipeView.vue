<script setup lang="ts">
import { Swipe, SwipeItem, type SwipeInstance } from 'vant'
import 'vant/es/swipe/style'
import 'vant/es/swipe-item/style'
import { nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AccountsView from './AccountsView.vue'
import HomeView from './HomeView.vue'

const route = useRoute()
const router = useRouter()
const swipe = ref<SwipeInstance>()
const homeView = ref<InstanceType<typeof HomeView>>()
const initialIndex = route.name === 'accounts' ? 1 : 0
const activeIndex = ref(initialIndex)
let edgeTouchStart: { x: number; y: number } | undefined

watch(
  () => route.name,
  async (routeName) => {
    if (routeName !== 'home' && routeName !== 'accounts') return
    const targetIndex = routeName === 'accounts' ? 1 : 0
    if (targetIndex === activeIndex.value) return
    await nextTick()
    swipe.value?.swipeTo(targetIndex)
  },
)

function handleSwipeChange(index: number): void {
  activeIndex.value = index
  const routeName = index === 1 ? 'accounts' : 'home'
  if (route.name !== routeName) {
    void router.replace({ name: routeName })
  }
}

function handleTouchStart(event: TouchEvent): void {
  if (activeIndex.value !== 0 || event.touches.length !== 1) {
    edgeTouchStart = undefined
    return
  }
  const touch = event.touches[0]
  if (!touch) return
  edgeTouchStart = { x: touch.clientX, y: touch.clientY }
}

function handleTouchEnd(event: TouchEvent): void {
  const start = edgeTouchStart
  const touch = event.changedTouches[0]
  edgeTouchStart = undefined
  if (!start || !touch || activeIndex.value !== 0) return
  const deltaX = touch.clientX - start.x
  const deltaY = touch.clientY - start.y
  if (deltaX >= 54 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
    homeView.value?.openDrawer()
  }
}
</script>

<template>
  <Swipe
    ref="swipe"
    class="overview-swipe"
    :initial-swipe="initialIndex"
    :loop="false"
    :show-indicators="false"
    :duration="280"
    @touchstart.passive="handleTouchStart"
    @touchend="handleTouchEnd"
    @touchcancel="edgeTouchStart = undefined"
    @change="handleSwipeChange"
  >
    <SwipeItem>
      <div class="overview-slide"><HomeView ref="homeView" /></div>
    </SwipeItem>
    <SwipeItem>
      <div class="overview-slide"><AccountsView /></div>
    </SwipeItem>
  </Swipe>
</template>

<style scoped>
.overview-swipe {
  height: 100dvh;
  background: var(--color-background);
}

.overview-swipe :deep(.van-swipe__track) {
  transition-timing-function: var(--ease-emphasized);
  will-change: transform;
}

.overview-slide {
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
}

.overview-slide::-webkit-scrollbar {
  display: none;
}
</style>
