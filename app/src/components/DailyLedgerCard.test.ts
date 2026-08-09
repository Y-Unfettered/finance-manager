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
            originalAmountMinor: 4_300,
            discountMinor: 500,
            occurredAt: '2026-08-03T04:00:00.000Z',
            title: '午餐',
            categoryLabel: '餐饮',
            noteLabel: '午餐',
            accountLabel: '微信余额',
          },
          {
            id: 'income',
            type: 'income',
            amountMinor: 3_300,
            occurredAt: '2026-08-03T03:00:00.000Z',
            title: '红包',
            categoryLabel: '奖金',
            noteLabel: '红包',
            accountLabel: '现金',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('08.03 周一')
    expect(wrapper.find('.transaction-row__body strong').text()).toBe('餐饮')
    expect(wrapper.find('.transaction-row__body span').text()).toContain('午餐')
    expect(wrapper.find('.transaction-row__right small').text()).toBe('微信余额')
    expect(wrapper.text()).toContain('+33.00')
    expect(wrapper.text()).toContain('优惠 ¥5.00')
    expect(wrapper.find('[data-type="expense"]').exists()).toBe(true)
  })

  it('reserves a wider leading column while transactions are selected', () => {
    const wrapper = mount(DailyLedgerCard, {
      props: {
        label: '8月',
        incomeMinor: 0,
        expenseMinor: 3_800,
        summary: '流入 ¥0.00 · 流出 ¥38.00',
        items: [
          {
            id: 'expense',
            type: 'expense',
            amountMinor: 3_800,
            occurredAt: '2026-08-03T04:00:00.000Z',
            title: '午餐',
            accountLabel: '08/03',
          },
        ],
        selectionMode: true,
        selectedIds: ['expense'],
      },
    })

    expect(wrapper.text()).toContain('流入 ¥0.00 · 流出 ¥38.00')
    expect(wrapper.find('.transaction-row--selection-mode').exists()).toBe(true)
    expect(wrapper.find('.transaction-row__check--active').exists()).toBe(true)
  })
})
