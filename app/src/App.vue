<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'

import AppBottomNav from '@/components/AppBottomNav.vue'

const route = useRoute()
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <AppBottomNav v-if="route.meta.bottomNav" />
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.page-leave-to {
  opacity: 0;
}
</style>
