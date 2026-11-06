import { getCurrentInstance, onDeactivated, onUnmounted, watch, type WatchSource } from 'vue'

/**
 * 统一弹层滚动锁（PRD BUG-02 治本方案）。
 *
 * 之前 Vant Popup 的 lock-scroll 锁的是 document.body，而本应用真正的滚动容器是
 * `.route-page-frame`（fixed + overflow-y:auto）。锁的对象和实际滚动的对象不是同一个，
 * body 上残留的 van-overflow-hidden / touchmove 拦截会导致"取消后整页无法滚动"。
 *
 * 这里改为直接锁 `.route-page-frame`：引用计数配对释放；页面失活/组件卸载时强制全部释放，
 * 保证任何路径下都不会残留滚动锁。
 */

const SCROLL_FRAME_SELECTOR = '.route-page-frame'

let lockCount = 0
let lockedElement: HTMLElement | null = null
let savedOverflow = ''

function acquirePageScrollLock(): void {
  if (lockCount++ > 0) return
  const element = document.querySelector<HTMLElement>(SCROLL_FRAME_SELECTOR)
  if (!element) {
    // 找不到滚动容器（如纯单测环境）时直接跳过，不影响弹层本身
    lockCount = 0
    return
  }
  lockedElement = element
  savedOverflow = element.style.overflow
  element.style.overflow = 'hidden'
}

function releasePageScrollLock(): void {
  if (lockCount === 0) return
  if (--lockCount > 0) return
  if (lockedElement) {
    lockedElement.style.overflow = savedOverflow
    lockedElement = null
  }
}

/** 兜底：页面失活/组件卸载时可能来不及逐个释放，直接清空计数并恢复滚动。 */
function forceReleaseAllPageScrollLocks(): void {
  lockCount = 0
  if (lockedElement) {
    lockedElement.style.overflow = savedOverflow
    lockedElement = null
  }
}

/**
 * 弹层组件在 `active`（通常是 visible/show 计算属性）为真期间锁住页面滚动。
 * 需要在组件 setup 上下文中调用；页面失活或组件卸载时自动强制释放。
 */
export function usePageScrollLock(active: WatchSource<boolean>): void {
  watch(
    active,
    (value) => {
      if (value) acquirePageScrollLock()
      else releasePageScrollLock()
    },
    { immediate: true },
  )
  if (getCurrentInstance()) {
    onDeactivated(forceReleaseAllPageScrollLocks)
    onUnmounted(forceReleaseAllPageScrollLocks)
  }
}
