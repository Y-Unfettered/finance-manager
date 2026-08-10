import { mount } from '@vue/test-utils'

import CategoryIcon from '@/components/CategoryIcon.vue'

import { CATEGORY_ICON_OPTIONS, findCategoryIcon } from './category-icons'

describe('category icon catalog', () => {
  it('offers matching outline and filled series', () => {
    const outline = CATEGORY_ICON_OPTIONS.filter((icon) => icon.series === 'outline')
    const filled = CATEGORY_ICON_OPTIONS.filter((icon) => icon.series === 'filled')

    expect(outline.length).toBeGreaterThan(50)
    expect(filled).toHaveLength(outline.length)
  })

  it('keeps legacy icon keys compatible', () => {
    expect(findCategoryIcon('utensils').component).toBeDefined()
    expect(findCategoryIcon('circle-ellipsis').component).toBeDefined()
  })

  it('renders filled icons as solid path data', () => {
    const wrapper = mount(CategoryIcon, {
      props: { iconKey: 'filled:utensils', color: '#5b8def' },
    })

    expect(wrapper.find('.category-icon__filled path').attributes('fill')).toBe('currentColor')
  })

  it('renders uploaded image data URIs instead of the fallback icon', () => {
    const dataUri = 'data:image/png;base64,Y2F0ZWdvcnktaWNvbg=='
    const wrapper = mount(CategoryIcon, {
      props: { iconKey: dataUri, color: '#5b8def', label: '自定义分类' },
    })

    expect(wrapper.get('.category-icon__custom').attributes('src')).toBe(dataUri)
    expect(wrapper.findAll('svg')).toHaveLength(0)
    expect(wrapper.attributes('aria-label')).toBe('自定义分类')
  })

  it('does not treat SVG or malformed data URIs as uploaded images', () => {
    const wrapper = mount(CategoryIcon, {
      props: { iconKey: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    })

    expect(wrapper.find('.category-icon__custom').exists()).toBe(false)
    expect(wrapper.find('svg').exists()).toBe(true)
  })
})
