import type { App, Plugin } from 'vue'
import type { Router } from 'vue-router'

import { navigateBack } from './navigation-transition'

export interface RouterTouchOptions {
  edgeWidth?: number
  minDistance?: number
  maxVerticalDistance?: number
  minVelocity?: number
}

interface TouchOrigin {
  x: number
  y: number
  startedAt: number
  tracking: boolean
}

const DEFAULT_OPTIONS: Required<RouterTouchOptions> = {
  edgeWidth: 28,
  minDistance: 72,
  maxVerticalDistance: 80,
  minVelocity: 0.35,
}

/**
 * Vue Router 的移动端边缘返回插件。
 * 从屏幕左边缘向右滑动时触发 router.back()，表单与弹层区域不会误触。
 */
export function createRouterTouch(router: Router, userOptions: RouterTouchOptions = {}): Plugin {
  const options = { ...DEFAULT_OPTIONS, ...userOptions }
  let origin: TouchOrigin | undefined

  function canStart(event: TouchEvent): boolean {
    const touch = event.touches[0]
    const target = event.target instanceof Element ? event.target : undefined
    if (!touch || event.touches.length !== 1 || touch.clientX > options.edgeWidth) return false
    if (router.currentRoute.value.meta.swipeBack === false) return false
    return !target?.closest(
      'input, textarea, select, [contenteditable="true"], .van-popup, .van-overlay, [data-router-touch-ignore]',
    )
  }

  function onTouchStart(event: TouchEvent): void {
    if (!canStart(event)) {
      origin = undefined
      return
    }
    const touch = event.touches[0]!
    origin = {
      x: touch.clientX,
      y: touch.clientY,
      startedAt: performance.now(),
      tracking: false,
    }
  }

  function onTouchMove(event: TouchEvent): void {
    const start = origin
    const touch = event.touches[0]
    if (!start || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaY) > options.maxVerticalDistance || deltaX < -8) {
      origin = undefined
      return
    }
    if (deltaX > 12 && deltaX > Math.abs(deltaY) * 1.2) {
      start.tracking = true
      event.preventDefault()
    }
  }

  function onTouchEnd(event: TouchEvent): void {
    const start = origin
    const touch = event.changedTouches[0]
    origin = undefined
    if (!start?.tracking || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = Math.abs(touch.clientY - start.y)
    const elapsed = Math.max(1, performance.now() - start.startedAt)
    const velocity = deltaX / elapsed
    if (
      deltaX >= options.minDistance &&
      deltaY <= options.maxVerticalDistance &&
      (velocity >= options.minVelocity || deltaX >= options.minDistance * 1.5)
    ) {
      navigateBack(router, { name: 'home' })
    }
  }

  function reset(): void {
    origin = undefined
  }

  return {
    install(app: App): void {
      if (typeof window === 'undefined') return
      window.addEventListener('touchstart', onTouchStart, { passive: true })
      window.addEventListener('touchmove', onTouchMove, { passive: false })
      window.addEventListener('touchend', onTouchEnd, { passive: true })
      window.addEventListener('touchcancel', reset, { passive: true })
      app.onUnmount(() => {
        window.removeEventListener('touchstart', onTouchStart)
        window.removeEventListener('touchmove', onTouchMove)
        window.removeEventListener('touchend', onTouchEnd)
        window.removeEventListener('touchcancel', reset)
      })
    },
  }
}
