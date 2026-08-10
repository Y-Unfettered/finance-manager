import { inject, type InjectionKey, type Ref, ref } from 'vue'

export const routePageActiveKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol('routePageActive')
export const routePageScrollRestoreKey: InjectionKey<() => void> = Symbol(
  'routePageScrollRestore',
)

/** 页面外单独挂载组件（例如单测）时默认视为激活。 */
export function useRoutePageActive(): Readonly<Ref<boolean>> {
  return inject(routePageActiveKey, ref(true))
}
