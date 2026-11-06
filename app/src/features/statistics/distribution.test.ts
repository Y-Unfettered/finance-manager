import { describe, expect, it } from 'vitest'

import { buildDistribution, DISTRIBUTION_OTHER_ID } from './statistics-service'

const row = (id: string, name: string, amountMinor: number) => ({ id, name, amountMinor })

describe('buildDistribution', () => {
  it('过滤 0 值与负值（退款冲抵、纯退款分类不出现）', () => {
    const slices = buildDistribution([
      row('a', '餐饮', 5_000),
      row('b', '冲抵为零', 0),
      row('c', '纯退款', -3_000),
    ])
    expect(slices.map((s) => s.id)).toEqual(['a'])
  })

  it('按金额倒序排列', () => {
    const slices = buildDistribution([row('s', '小', 100), row('l', '大', 900), row('m', '中', 500)])
    expect(slices.map((s) => s.id)).toEqual(['l', 'm', 's'])
  })

  it('超出前 8 的并入"其他"，且固定最后一位', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`c${i}`, `分类${i}`, 1_000 - i))
    const slices = buildDistribution(rows)
    expect(slices).toHaveLength(9)
    expect(slices[8]).toMatchObject({ id: DISTRIBUTION_OTHER_ID, name: '其他', isOther: true })
    expect(slices.slice(0, 8).every((s) => !s.isOther)).toBe(true)
  })

  it('占比 <1% 的并入"其他"', () => {
    const slices = buildDistribution([
      row('a', '大头', 99_900),
      row('b', '零头', 100), // 100/100000 = 0.1% < 1%
    ])
    expect(slices).toHaveLength(2)
    expect(slices[0]).toMatchObject({ id: 'a' })
    expect(slices[1]).toMatchObject({ id: DISTRIBUTION_OTHER_ID, amountMinor: 100 })
  })

  it('全部 <1%（碎片分类）时至少保留最大一项', () => {
    const rows = Array.from({ length: 300 }, (_, i) => row(`c${i}`, `分类${i}`, 1))
    const slices = buildDistribution(rows)
    expect(slices[0]).toMatchObject({ id: 'c0' })
    expect(slices[slices.length - 1]?.isOther).toBe(true)
  })

  it('空数据返回空数组', () => {
    expect(buildDistribution([])).toEqual([])
    expect(buildDistribution([row('b', '纯退款', -100)])).toEqual([])
  })
})
