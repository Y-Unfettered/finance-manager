import { mount } from '@vue/test-utils'

import DailyLedgerCard from './DailyLedgerCard.vue'

describe('DailyLedgerCard', () => {
  it('renders expense and income rows with their account labels', () => {
    const wrapper = mount(DailyLedgerCard, {
      props: {
        label: '08.03 周一',
        incomeMinor: 3_300,
        expenseMinor: 3_800,
        items: [
          {
            id: 'expense',
            type: 'expense',
            amountMinor: 3_800,
            occurredAt: '2026-08-03T04:00:00.000Z',
            title: '午餐',
            accountLabel: '微信余额',
          },
          {
            id: 'income',
            type: 'income',
            amountMinor: 3_300,
            occurredAt: '2026-08-03T03:00:00.000Z',
            title: '红包',
            accountLabel: '现金',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('08.03 周一')
    expect(wrapper.text()).toContain('午餐')
    expect(wrapper.text()).toContain('微信余额')
    expect(wrapper.text()).toContain('+¥33.00')
    expect(wrapper.find('[data-type="expense"]').exists()).toBe(true)
  })
})
