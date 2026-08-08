<script setup lang="ts">
import {
  BookOpen,
  FileText,
  Search,
  Receipt,
  CreditCard,
  PiggyBank,
  MessageCircle,
  Info,
  Settings,
  X,
} from '@lucide/vue'
import { Popup } from 'vant'
import 'vant/es/popup/style'
import { useRouter } from 'vue-router'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const router = useRouter()

interface DrawerEntry {
  id: string
  label: string
  icon: typeof BookOpen
  route?: string
  disabled?: boolean
}

const entries: readonly DrawerEntry[] = [
  { id: 'ledger', label: '我的账本', icon: BookOpen, route: 'home' },
  { id: 'reimburse', label: '报销管理', icon: FileText, disabled: true },
  { id: 'search', label: '搜索', icon: Search, route: 'search' },
  { id: 'bills', label: '账单', icon: Receipt, disabled: true },
  { id: 'installment', label: '分期', icon: CreditCard, disabled: true },
  { id: 'savings', label: '周期存钱计划', icon: PiggyBank, disabled: true },
  { id: 'feedback', label: '意见与反馈', icon: MessageCircle, disabled: true },
  { id: 'about', label: '关于', icon: Info, disabled: true },
  { id: 'settings', label: '设置', icon: Settings, route: 'profile' },
] as const

function close(): void {
  emit('update:show', false)
}

function go(entry: DrawerEntry): void {
  if (entry.disabled || !entry.route) return
  close()
  void router.replace({ name: entry.route })
}
</script>

<template>
  <Popup
    :show="show"
    teleport="body"
    position="left"
    :style="{ width: '72%', height: '100%' }"
    class="side-drawer"
    @update:show="$emit('update:show', $event)"
  >
    <div class="side-drawer__safe-top">
      <button type="button" class="side-drawer__close" aria-label="关闭侧栏" @click="close">
        <X :size="22" :stroke-width="1.75" aria-hidden="true" />
      </button>
    </div>
    <div class="side-drawer__profile">
      <div class="side-drawer__avatar">账</div>
      <strong>日常账本</strong>
      <span>个人记账 · 共 1 个账本</span>
    </div>
    <nav class="side-drawer__nav">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="drawer-entry"
        :class="{ 'drawer-entry--disabled': entry.disabled }"
        @click="go(entry)"
      >
        <component :is="entry.icon" :size="22" :stroke-width="1.75" aria-hidden="true" />
        <span>{{ entry.label }}</span>
        <i v-if="entry.disabled" class="drawer-entry__tag">规划中</i>
      </button>
    </nav>
    <footer class="side-drawer__footer">财务经理 v0.2.1</footer>
  </Popup>
</template>

<style scoped>
.side-drawer {
  display: flex;
  flex-direction: column;
  color: var(--color-text-primary);
  background: var(--color-surface);
}
.side-drawer__safe-top {
  display: flex;
  justify-content: flex-end;
  padding: calc(env(safe-area-inset-top) + var(--space-2)) var(--space-3) 0;
}
.side-drawer__close {
  display: grid;
  width: 40px;
  height: 40px;
  padding: 0;
  place-items: center;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
}
.side-drawer__profile {
  display: grid;
  padding: var(--space-5) var(--space-5) var(--space-6);
  gap: var(--space-1);
}
.side-drawer__avatar {
  display: grid;
  width: 56px;
  height: 56px;
  margin-bottom: var(--space-3);
  place-items: center;
  color: white;
  font-size: var(--type-money-summary-size);
  font-weight: 600;
  background: linear-gradient(135deg, var(--color-primary-500), #2a9d8f);
  border-radius: 18px;
}
.side-drawer__profile strong {
  font-size: var(--type-section-title-size);
  font-weight: 600;
}
.side-drawer__profile span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}
.side-drawer__nav {
  display: grid;
  padding: 0 var(--space-3);
  gap: 2px;
  overflow-y: auto;
  flex: 1;
}
.drawer-entry {
  display: flex;
  min-height: 52px;
  padding: 0 var(--space-3);
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-primary);
  font-size: var(--type-body-size);
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
}
.drawer-entry svg {
  color: var(--color-text-tertiary);
}
.drawer-entry span {
  flex: 1;
  text-align: left;
}
.drawer-entry:active {
  background: var(--color-primary-50);
}
.drawer-entry--disabled {
  color: var(--color-text-tertiary);
  cursor: not-allowed;
}
.drawer-entry__tag {
  padding: 2px 8px;
  color: var(--color-text-tertiary);
  font-style: normal;
  font-size: var(--type-caption-size);
  background: var(--color-background);
  border-radius: var(--radius-pill);
}
.side-drawer__footer {
  padding: var(--space-5) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom));
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
  border-top: 1px solid var(--color-divider);
}
</style>
