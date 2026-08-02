import { mount } from '@vue/test-utils'

import MoneyText from './MoneyText.vue'

describe('MoneyText', () => {
  it('formats integer minor units as CNY', () => {
    const wrapper = mount(MoneyText, {
      props: { amountMinor: 139697 },
    })

    expect(wrapper.text()).toContain('1,396.97')
  })

  it('adds an explicit plus sign for positive income', () => {
    const wrapper = mount(MoneyText, {
      props: { amountMinor: 3300, tone: 'income', showPlus: true },
    })

    expect(wrapper.text()).toMatch(/^\+/)
    expect(wrapper.classes()).toContain('money-text--income')
  })

  it('keeps the negative sign for expenses', () => {
    const wrapper = mount(MoneyText, {
      props: { amountMinor: -3155, tone: 'expense' },
    })

    expect(wrapper.text()).toContain('-')
    expect(wrapper.classes()).toContain('money-text--expense')
  })
})
