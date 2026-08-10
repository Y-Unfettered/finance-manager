import { readonly, ref } from 'vue'
import type { RouteLocationRaw, Router } from 'vue-router'

export type NavigationDirection = 'forward' | 'back'

const currentDirection = ref<NavigationDirection>('forward')
const currentEntryId = ref('')
const cacheEpoch = ref(0)
let forcedNextDirection: NavigationDirection | undefined
let entrySequence = 0
let pendingEntryId: string | undefined

const ENTRY_STATE_KEY = '__financeManagerEntryId'

export const navigationDirection = readonly(currentDirection)
export const navigationEntryId = readonly(currentEntryId)
export const navigationCacheEpoch = readonly(cacheEpoch)

export function setNavigationDirection(direction: NavigationDirection): void {
  currentDirection.value = direction
}

export function forceNextNavigationDirection(direction: NavigationDirection): void {
  forcedNextDirection = direction
}

export function applyNavigationDirection(fallback: NavigationDirection): void {
  setNavigationDirection(forcedNextDirection ?? fallback)
  forcedNextDirection = undefined
}

export function initializeNavigationEntry(): void {
  currentEntryId.value = historyEntryId() ?? createEntryId()
  commitNavigationEntry()
}

/** 历史前进/后退复用原 entry；新的 push/replace 分配全新 entry。 */
export function prepareNavigationEntry(historyTraversal: boolean): void {
  pendingEntryId = historyTraversal ? (historyEntryId() ?? createEntryId()) : createEntryId()
}

export function commitNavigationEntry(): void {
  if (pendingEntryId) {
    currentEntryId.value = pendingEntryId
    pendingEntryId = undefined
  }
  if (typeof window === 'undefined' || !currentEntryId.value) return
  const state = window.history.state ?? {}
  if (state[ENTRY_STATE_KEY] === currentEntryId.value) return
  window.history.replaceState({ ...state, [ENTRY_STATE_KEY]: currentEntryId.value }, '')
}

export function resetNavigationStateCache(): void {
  cacheEpoch.value += 1
}

function historyEntryId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const value = window.history.state?.[ENTRY_STATE_KEY]
  return typeof value === 'string' && value ? value : undefined
}

function createEntryId(): string {
  entrySequence += 1
  return `${Date.now().toString(36)}-${entrySequence.toString(36)}`
}

/** 有历史记录就正常返回；直接打开二级页时，按返回方向替换到兜底页面。 */
export function navigateBack(router: Router, fallback: RouteLocationRaw): void {
  forceNextNavigationDirection('back')
  if (typeof window !== 'undefined' && (window.history.state?.position ?? 0) > 0) {
    router.back()
    return
  }
  void router.replace(fallback)
}
