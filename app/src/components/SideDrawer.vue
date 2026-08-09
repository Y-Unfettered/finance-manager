<script setup lang="ts">
import { BookOpen, Search, ReceiptText, Settings } from '@lucide/vue'
import { Popup } from 'vant'
import 'vant/es/popup/style'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRoutePageActive } from '@/composables/routePageActivation'
import { useAppStore } from '@/stores/app'
import { useLedgerService } from '@/features/ledger/ledger-service'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const router = useRouter()
const pageActive = useRoutePageActive()
const visible = computed(() => props.show && pageActive.value)
const appStore = useAppStore()
const ledgers = useLedgerService()
const usedDays = ref(1)
const touchStart = ref<{ x: number; y: number }>()
const pendingRouteName = ref<string>()

interface DrawerEntry {
  id: string
  label: string
  icon: typeof BookOpen
  route?: string
  disabled?: boolean
}

const entries: readonly DrawerEntry[] = [
  { id: 'ledger', label: '我的账本', icon: BookOpen, route: 'ledgers' },
  { id: 'search', label: '搜索', icon: Search, route: 'search' },
  { id: 'bills', label: '账单', icon: ReceiptText, route: 'bills' },
  { id: 'settings', label: '设置', icon: Settings, route: 'settings' },
] as const

function close(): void {
  emit('update:show', false)
}

function go(entry: DrawerEntry): void {
  if (entry.disabled || !entry.route) return
  pendingRouteName.value = entry.route
  close()
}

function handleClosed(): void {
  const routeName = pendingRouteName.value
  pendingRouteName.value = undefined
  if (routeName) void router.push({ name: routeName })
}

async function loadLedgerCount(): Promise<void> {
  if (!ledgers) return
  const rows = await ledgers.list()
  const active = rows.find((item) => item.id === appStore.ledgerId) ?? rows[0]
  if (active) {
    const created = new Date(active.createdAt)
    usedDays.value = Math.max(1, Math.floor((Date.now() - created.getTime()) / 86_400_000) + 1)
  }
}

function handleTouchStart(event: TouchEvent): void {
  if (!visible.value) return
  const touch = event.touches[0]
  touchStart.value = touch ? { x: touch.clientX, y: touch.clientY } : undefined
}

function handleTouchEnd(event: TouchEvent): void {
  if (!visible.value) return
  const start = touchStart.value
  const touch = event.changedTouches[0]
  touchStart.value = undefined
  if (!start || !touch) return
  const deltaX = touch.clientX - start.x
  const deltaY = touch.clientY - start.y
  if (deltaX <= -48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) close()
}

watch(
  () => props.show,
  (show) => {
    if (show) void loadLedgerCount()
  },
)
onMounted(() => {
  void loadLedgerCount()
  window.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true })
  window.addEventListener('touchend', handleTouchEnd, true)
  window.addEventListener('touchcancel', handleTouchEnd, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('touchstart', handleTouchStart, true)
  window.removeEventListener('touchend', handleTouchEnd, true)
  window.removeEventListener('touchcancel', handleTouchEnd, true)
})
</script>

<template>
  <Popup
    :show="visible"
    teleport="body"
    position="left"
    transition="home-drawer"
    :style="{ width: '70%', height: '100%' }"
    class="side-drawer"
    @update:show="$emit('update:show', $event)"
    @closed="handleClosed"
  >
    <button class="side-drawer__profile" type="button" @click="go(entries[0]!)">
      <div class="side-drawer__avatar">L</div>
      <strong>{{ appStore.profileName }}</strong>
      <span>已使用 {{ usedDays }} 天</span>
    </button>
    <nav class="side-drawer__nav">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="drawer-entry"
        @click="go(entry)"
      >
        <span class="drawer-entry__icon">
          <component :is="entry.icon" :size="24" :stroke-width="2.6" aria-hidden="true" />
        </span>
        <span>{{ entry.label }}</span>
        <small v-if="entry.id === 'ledger'">{{ appStore.ledgerName }}</small>
      </button>
    </nav>
  </Popup>
</template>

<style scoped>
.side-drawer {
  display: flex;
  flex-direction: column;
  color: var(--color-text-primary);
  background: var(--color-surface);
}
.side-drawer__profile {
  display: grid;
  width: 100%;
  padding: calc(env(safe-area-inset-top) + 64px) 28px 42px;
  gap: var(--space-1);
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}
.side-drawer__avatar {
  display: grid;
  width: 64px;
  height: 64px;
  margin-bottom: 18px;
  place-items: center;
  color: white;
  font-size: 27px;
  font-weight: 750;
  background: linear-gradient(145deg, #6c5ce7, #9b8cff 55%, #ffc7b7);
  border-radius: 50%;
}
.side-drawer__profile strong {
  font-size: 22px;
  font-weight: 700;
}
.side-drawer__profile span {
  color: var(--color-text-tertiary);
  font-size: 14px;
  line-height: 22px;
}
.side-drawer__nav {
  display: grid;
  padding: 0 20px;
  align-content: start;
  gap: 10px;
  overflow-y: auto;
}
.drawer-entry {
  display: grid;
  min-height: 58px;
  padding: 0 8px;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  color: var(--color-text-primary);
  font-size: 17px;
  font-weight: 550;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
}
.drawer-entry__icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: #7f898f;
}
.drawer-entry__icon svg {
  fill: currentcolor;
  fill-opacity: 0.13;
}
.drawer-entry > span:nth-child(2) {
  text-align: left;
}
.drawer-entry small {
  color: var(--color-text-tertiary);
  font-size: 13px;
  font-weight: 400;
}
.drawer-entry:active {
  background: var(--color-primary-50);
}

:global(.home-drawer-enter-active),
:global(.home-drawer-leave-active) {
  transition: transform var(--motion-slow) var(--ease-emphasized) !important;
  will-change: transform;
}

:global(.home-drawer-enter-from),
:global(.home-drawer-leave-to) {
  transform: translate3d(-100%, -50%, 0) !important;
}

:global(.home-drawer-enter-to),
:global(.home-drawer-leave-from) {
  transform: translate3d(0, -50%, 0) !important;
}
</style>
