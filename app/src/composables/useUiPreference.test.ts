/* eslint-disable vue/one-component-per-file */
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import { useUiPreference } from './useUiPreference'

describe('useUiPreference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('restores and records an allowed display preference', async () => {
    localStorage.setItem('finance-manager:ui:test-metric', 'income')
    const Harness = defineComponent({
      setup() {
        const metric = useUiPreference('test-metric', 'flow', [
          'flow',
          'balance',
          'income',
          'expense',
        ] as const)
        return () => h('button', { onClick: () => (metric.value = 'expense') }, metric.value)
      },
    })
    const wrapper = mount(Harness)

    expect(wrapper.get('button').text()).toBe('income')
    await wrapper.get('button').trigger('click')
    await nextTick()
    expect(localStorage.getItem('finance-manager:ui:test-metric')).toBe('expense')
  })

  it('rejects stale values and can prioritize an explicit route value', async () => {
    localStorage.setItem('finance-manager:ui:test-view', 'unknown')
    const fallback = mount(
      defineComponent({
        setup() {
          const view = useUiPreference('test-view', 'list', ['list', 'calendar'] as const)
          return () => h('span', view.value)
        },
      }),
    )
    expect(fallback.text()).toBe('list')

    localStorage.setItem('finance-manager:ui:test-view', 'list')
    const explicitRoute = mount(
      defineComponent({
        setup() {
          const view = useUiPreference('test-view', 'calendar', ['list', 'calendar'] as const, {
            preferDefault: true,
          })
          return () => h('span', view.value)
        },
      }),
    )
    await nextTick()
    expect(explicitRoute.text()).toBe('calendar')
    expect(localStorage.getItem('finance-manager:ui:test-view')).toBe('calendar')
  })
})
