import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import type { UpcomingReminder } from '@/domain/entities'

import ReminderPopup from './ReminderPopup.vue'

function makeItem(overrides: Partial<UpcomingReminder> = {}): UpcomingReminder {
  return {
    reminder: {
      id: 'reminder_1',
      ledgerId: 'ledger',
      type: 'credit_card_due',
      title: '花呗还款',
      dueDate: '2026-11-08T00:00:00.000Z',
      amountMinor: 58_047,
      advanceDays: 3,
      recurrence: 'monthly',
      enabled: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      accountName: '花呗',
    },
    daysUntilDue: 0,
    isAdvance: false,
    nextDueDate: '2026-11-08T00:00:00.000Z',
    isHandled: false,
    ...overrides,
  }
}

function mountPopup(items: UpcomingReminder[]) {
  const wrapper = mount(ReminderPopup, {
    props: { show: true, items },
    attachTo: document.body,
  })
  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ReminderPopup', () => {
  it('把窗口内提醒渲染成卡片：标题/类型/下一到期日/到期文案/金额', () => {
    const wrapper = mountPopup([makeItem()])
    const text = document.body.textContent ?? ''
    expect(text).toContain('花呗还款')
    expect(text).toContain('信用卡还款')
    expect(text).toContain('2026-11-08')
    expect(text).toContain('今天到期')
    expect(text).toContain('580.47')
    expect(text).toContain('每月重复')
    expect(text).toContain('今日不再提醒')
    wrapper.unmount()
  })

  it('未来到期显示"N 天后到期"，多条按传入顺序并列', () => {
    const wrapper = mountPopup([
      makeItem(),
      makeItem({
        reminder: { ...makeItem().reminder, id: 'reminder_2', title: '白条还款' },
        daysUntilDue: 3,
        isAdvance: true,
        nextDueDate: '2026-11-13T00:00:00.000Z',
      }),
    ])
    const text = document.body.textContent ?? ''
    expect(text).toContain('3 天后到期')
    expect(text).toContain('2 项进入提醒期')
    wrapper.unmount()
  })

  it('点某条"标记已处理"只把该条 id 抛给上层', async () => {
    const wrapper = mountPopup([makeItem()])
    const chips = document.body.querySelectorAll<HTMLButtonElement>('.reminder-popup__chip')
    expect(chips.length).toBe(1)
    chips[0]!.click()
    await nextTick()
    expect(wrapper.emitted('mark-handled')).toEqual([['reminder_1']])
    wrapper.unmount()
  })

  it('勾选"今日不再提醒"后点知道了，携带 true 抛给上层并关闭自身', async () => {
    const wrapper = mountPopup([makeItem()])
    const check = document.body.querySelector<HTMLButtonElement>('.reminder-popup__check')!
    check.click()
    await nextTick()
    const ok = document.body.querySelector<HTMLButtonElement>('.reminder-popup__ok')!
    ok.click()
    await nextTick()
    expect(wrapper.emitted('dismiss')).toEqual([[true]])
    expect(wrapper.emitted('update:show')).toEqual([[false]])
    wrapper.unmount()
  })

  it('不勾选就点知道了：dismiss 抛 false（当天照常再弹）', async () => {
    const wrapper = mountPopup([makeItem()])
    document.body.querySelector<HTMLButtonElement>('.reminder-popup__ok')!.click()
    await nextTick()
    expect(wrapper.emitted('dismiss')).toEqual([[false]])
    wrapper.unmount()
  })
})
