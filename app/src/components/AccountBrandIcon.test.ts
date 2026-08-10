import { mount } from '@vue/test-utils'

import AccountBrandIcon from './AccountBrandIcon.vue'

const baseProps = { label: '测试账户', symbol: '测', color: '#1677ff' }

describe('AccountBrandIcon', () => {
  it('renders a bundled brand logo instead of placeholder text', () => {
    const wrapper = mount(AccountBrandIcon, {
      props: { ...baseProps, label: '支付宝', brandKey: 'alipay', size: 'large' },
    })

    expect(wrapper.classes()).toContain('brand-icon--large')
    expect(wrapper.find('.brand-icon__logo').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('测')
  })

  it('renders the real bank asset for an existing bank key', () => {
    const wrapper = mount(AccountBrandIcon, {
      props: { ...baseProps, label: '中信银行', brandKey: 'citic' },
    })

    expect(wrapper.classes()).toContain('brand-icon--bank')
    expect(wrapper.find('.brand-icon__bank').attributes('src')).toContain('citic.png')
  })

  it('adds a product badge for child accounts', () => {
    const wrapper = mount(AccountBrandIcon, {
      props: { ...baseProps, label: '余额宝', brandKey: 'yu-ebao' },
    })

    expect(wrapper.find('.brand-icon__logo').exists()).toBe(true)
    expect(wrapper.find('.brand-icon__badge').text()).toBe('余')
  })

  it('renders a validated uploaded image from the account preference', () => {
    const dataUri = 'data:image/png;base64,dGVzdA=='
    const wrapper = mount(AccountBrandIcon, {
      props: { ...baseProps, brandKey: 'custom-upload', symbol: dataUri },
    })

    expect(wrapper.classes()).toContain('brand-icon--custom')
    expect(wrapper.find('.brand-icon__custom').attributes('src')).toBe(dataUri)
  })
})
