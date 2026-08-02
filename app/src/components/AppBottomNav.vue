<script setup lang="ts">
import { ChartNoAxesColumn, Home, Plus, UserRound, WalletCards } from '@lucide/vue'
import { RouterLink } from 'vue-router'
</script>

<template>
  <nav class="bottom-nav" aria-label="主导航">
    <RouterLink class="bottom-nav__item" :to="{ name: 'home' }">
      <Home :size="24" :stroke-width="1.75" aria-hidden="true" />
      <span>首页</span>
    </RouterLink>
    <RouterLink class="bottom-nav__item" :to="{ name: 'accounts' }">
      <WalletCards :size="24" :stroke-width="1.75" aria-hidden="true" />
      <span>资产</span>
    </RouterLink>
    <RouterLink class="bottom-nav__create" :to="{ name: 'new-expense' }" aria-label="记一笔">
      <Plus :size="26" :stroke-width="2" aria-hidden="true" />
    </RouterLink>
    <RouterLink class="bottom-nav__item" :to="{ name: 'analysis' }">
      <ChartNoAxesColumn :size="24" :stroke-width="1.75" aria-hidden="true" />
      <span>分析</span>
    </RouterLink>
    <RouterLink class="bottom-nav__item" :to="{ name: 'profile' }">
      <UserRound :size="24" :stroke-width="1.75" aria-hidden="true" />
      <span>我的</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  height: calc(var(--size-bottom-nav) + env(safe-area-inset-bottom));
  padding: 0 max(var(--space-2), env(safe-area-inset-right)) env(safe-area-inset-bottom)
    max(var(--space-2), env(safe-area-inset-left));
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: center;
  background: rgb(255 255 255 / 96%);
  border-top: 1px solid var(--color-divider);
  backdrop-filter: blur(18px);
}

.bottom-nav__item {
  display: flex;
  min-width: 0;
  height: 56px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
  color: var(--color-text-tertiary);
  font-size: var(--type-nav-label-size);
  font-weight: 500;
  line-height: var(--type-nav-label-line);
  text-decoration: none;
}

.bottom-nav__item.router-link-active {
  color: var(--color-primary-600);
}

.bottom-nav__create {
  display: grid;
  width: 56px;
  height: 56px;
  margin: -18px auto 0;
  place-items: center;
  color: white;
  background: var(--color-primary-600);
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 24px rgb(23 107 93 / 22%);
  transition: transform var(--motion-instant) var(--ease-standard);
}

.bottom-nav__create:active {
  transform: scale(0.97);
}
</style>
