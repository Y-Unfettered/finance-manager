import { inject, onActivated } from 'vue'

import { routePageScrollRestoreKey } from './routePageActivation'

/**
 * KeepAlive 首次展示时页面自身的 onMounted 会负责加载；之后从子页面返回时，
 * 只刷新数据，不销毁页面已有的滚动、筛选和展开状态。
 */
export function useRefreshOnActivated(refresh: () => void | Promise<void>): void {
  let initialActivation = true
  const restoreScroll = inject(routePageScrollRestoreKey, () => {})

  onActivated(() => {
    if (initialActivation) {
      initialActivation = false
      return
    }
    void (async () => {
      try {
        await refresh()
      } finally {
        restoreScroll()
      }
    })()
  })
}
