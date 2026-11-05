import { mount } from '@vue/test-utils'

import AccountActivityMonthCard from './AccountActivityMonthCard.vue'

describe('AccountActivityMonthCard', () => {
  it('renders a two-line period summary and account-oriented activity rows', () => {
    const wrapper = mount(AccountActivityMonthCard, {
      props: {
        label: '08月',
        period: '08/01–08/31',
        inflowMinor: 21_668,
        outflowMinor: 5_880,
        items: [
          {
            id: 'repayment',
            type: 'repayment',
            amountMinor: 21_668,
            displayAmountMinor: 21_668,
            occurredAt: '2026-08-08T04:00:00.000Z',
            title: '还款',
            categoryLabel: '还款',
            dateLabel: '08-08',
            noteLabel: '同事聚餐',
            accountLabel: '中信银行→美团月付',
          },
          {
            id: 'purchase',
            type: 'credit_purchase',
            amountMinor: 2_064,
            displayAmountMinor: -2_064,
            occurredAt: '2026-08-05T04:00:00.000Z',
            title: '三餐',
            categoryLabel: '三餐',
            dateLabel: '08-05',
            accountLabel: '美团月付',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('08月')
    expect(wrapper.text()).toContain('08/01–08/31')
    expect(wrapper.text()).toContain('流入：¥216.68')
    expect(wrapper.text()).toContain('流出：¥58.80')
    expect(wrapper.text()).toContain('中信银行→美团月付')
    expect(wrapper.text()).toContain('-20.64')
    expect(wrapper.text()).toContain('08-08 · 同事聚餐')
    expect(wrapper.text()).toContain('08-05')
    expect(wrapper.find('.account-activity-row__body small').exists()).toBe(false)
  })
})
