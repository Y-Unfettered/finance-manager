import { describe, expect, it } from 'vitest'

import {
  categoryColorVar,
  isCategoryColorSlot,
  nearestColorSlot,
  normalizeCategoryColor,
} from './category-color'

describe('category-color', () => {
  it('槽名判断', () => {
    expect(isCategoryColorSlot('cat-1')).toBe(true)
    expect(isCategoryColorSlot('cat-8')).toBe(true)
    expect(isCategoryColorSlot('cat-9')).toBe(false)
    expect(isCategoryColorSlot('#5b8def')).toBe(false)
  })

  it('categoryColorVar：槽名解析为 CSS 变量，hex 原样，空值落默认槽', () => {
    expect(categoryColorVar('cat-3')).toBe('var(--color-cat-3)')
    expect(categoryColorVar('#123456')).toBe('#123456')
    expect(categoryColorVar('')).toBe('var(--color-cat-1)')
    expect(categoryColorVar(undefined)).toBe('var(--color-cat-1)')
    expect(categoryColorVar('junk')).toBe('var(--color-cat-1)')
  })

  it('nearestColorSlot：按色相就近映射', () => {
    expect(nearestColorSlot('#d45f5a')).toBe('cat-4') // 珊瑚红
    expect(nearestColorSlot('#e02e24')).toBe('cat-4') // 正红
    expect(nearestColorSlot('#d8a248')).toBe('cat-3') // 金
    expect(nearestColorSlot('#2a806f')).toBe('cat-1') // 绿
    expect(nearestColorSlot('#55a6a6')).toBe('cat-6') // 青
    expect(nearestColorSlot('#4778ad')).toBe('cat-2') // 蓝
    expect(nearestColorSlot('#8a73bd')).toBe('cat-5') // 紫
    expect(nearestColorSlot('#a8763e')).toBe('cat-8') // 棕
    expect(nearestColorSlot('#8a939b')).toBe('cat-7') // 低饱和灰
  })

  it('normalizeCategoryColor：槽名透传、hex 映射、非法值落默认', () => {
    expect(normalizeCategoryColor('cat-5')).toBe('cat-5')
    expect(normalizeCategoryColor('#5b8def')).toBe('cat-2') // 默认蓝 → 蓝
    expect(normalizeCategoryColor('nonsense')).toBe('cat-1')
    expect(normalizeCategoryColor(null)).toBe('cat-1')
  })
})
