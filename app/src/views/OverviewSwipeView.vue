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
const initialIndex = route.name === 'accounts' ? 1 : 0

watch(
  () => route.name,
  async (routeName) => {
    if (routeName !== 'home' && routeName !== 'accounts') return
    await nextTick()
    swipe.value?.swipeTo(routeName === 'accounts' ? 1 : 0, { immediate: true })
  },
)

function handleSwipeChange(index: number): void {
  const routeName = index === 1 ? 'accounts' : 'home'
  if (route.name !== routeName) {
    void router.replace({ name: routeName })
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
    :duration="220"
    @change="handleSwipeChange"
  >
    <SwipeItem>
      <div class="overview-slide"><HomeView /></div>
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
