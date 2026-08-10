/* eslint-disable vue/one-component-per-file */
import { defineComponent, h, KeepAlive, nextTick, ref, Teleport, type Component } from 'vue'
import { mount } from '@vue/test-utils'

import { useRoutePageActive } from '@/composables/routePageActivation'
import { useRefreshOnActivated } from '@/composables/useRefreshOnActivated'

import RoutePageFrame from './RoutePageFrame.vue'

describe('RoutePageFrame', () => {
  it('restores the exact cached entry while a new entry starts with fresh state', async () => {
    const entryId = ref('entry-a')
    const StatefulPage = defineComponent({
      setup() {
        const value = ref('')
        return () =>
          h('input', {
            value: value.value,
            onInput: (event: Event) => {
              value.value = (event.target as HTMLInputElement).value
            },
          })
      },
    })
    const Harness = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () =>
              h(RoutePageFrame, {
                key: entryId.value,
                viewComponent: StatefulPage,
              }),
          })
      },
    })
    const wrapper = mount(Harness)

    await wrapper.get('input').setValue('保留这次查看状态')
    const firstFrame = wrapper.get('.route-page-frame').element as HTMLElement
    firstFrame.scrollTop = 180

    entryId.value = 'entry-b'
    await nextTick()
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')

    entryId.value = 'entry-a'
    await nextTick()
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('保留这次查看状态')
    expect((wrapper.get('.route-page-frame').element as HTMLElement).scrollTop).toBe(180)
  })

  it('restores scroll positions from nested page scroll containers', async () => {
    const entryId = ref('entry-a')
    const NestedScrollPage = defineComponent({
      setup() {
        return () => h('div', { class: 'nested-scroll' }, h('div', { class: 'content' }))
      },
    })
    const Harness = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () =>
              h(RoutePageFrame, {
                key: entryId.value,
                viewComponent: NestedScrollPage,
              }),
          })
      },
    })
    const wrapper = mount(Harness)
    const firstScrollContainer = wrapper.get('.nested-scroll')
    const firstElement = firstScrollContainer.element as HTMLElement
    firstElement.scrollTop = 420
    await firstScrollContainer.trigger('scroll')

    entryId.value = 'entry-b'
    await nextTick()
    firstElement.scrollTop = 0

    entryId.value = 'entry-a'
    await nextTick()
    expect((wrapper.get('.nested-scroll').element as HTMLElement).scrollTop).toBe(420)
  })

  it('only exposes teleported controls from the active cached entry', async () => {
    const entryId = ref('entry-a')
    const PageWithTeleport = defineComponent({
      setup() {
        const active = useRoutePageActive()
        return () =>
          h(
            Teleport as unknown as Component,
            { to: 'body' },
            active.value ? [h('button', '悬浮操作')] : [],
          )
      },
    })
    const Harness = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () =>
              h(RoutePageFrame, {
                key: entryId.value,
                viewComponent: PageWithTeleport,
              }),
          })
      },
    })
    const wrapper = mount(Harness, { attachTo: document.body })

    expect(document.body.querySelectorAll('button')).toHaveLength(1)
    entryId.value = 'entry-b'
    await nextTick()
    expect(document.body.querySelectorAll('button')).toHaveLength(1)

    wrapper.unmount()
  })

  it('refreshes data on return without duplicating the initial load', async () => {
    const entryId = ref('entry-a')
    let refreshCount = 0
    const RefreshablePage = defineComponent({
      setup() {
        useRefreshOnActivated(() => {
          refreshCount += 1
        })
        return () => h('div')
      },
    })
    const Harness = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () =>
              h(RoutePageFrame, {
                key: entryId.value,
                viewComponent: RefreshablePage,
              }),
          })
      },
    })
    mount(Harness)
    expect(refreshCount).toBe(0)

    entryId.value = 'entry-b'
    await nextTick()
    expect(refreshCount).toBe(0)

    entryId.value = 'entry-a'
    await nextTick()
    expect(refreshCount).toBe(1)
  })
})
