<script setup lang="ts">
import { computed } from 'vue'

import { categoryColorVar } from '@/features/finance/category-color'
import { findCategoryIcon } from '@/features/finance/category-icons'

const props = withDefaults(
  defineProps<{
    iconKey?: string
    /** 槽名（cat-1..8）/ 历史 hex / CSS 颜色；空值落默认槽 */
    color?: string
    size?: number
    label?: string
  }>(),
  { iconKey: 'circle-ellipsis', color: '', size: 42, label: '分类' },
)

const icon = computed(() => findCategoryIcon(props.iconKey))
const customIconDataUri = computed(() => {
  const iconKey = props.iconKey.trim()
  return /^data:image\/(?:png|jpeg|webp);base64,/i.test(iconKey) ? iconKey : ''
})
const displayColor = computed(() => categoryColorVar(props.color))
const background = computed(() =>
  displayColor.value.startsWith('#')
    ? `${displayColor.value}1f`
    : `color-mix(in srgb, ${displayColor.value} 12%, transparent)`,
)
</script>

<template>
  <span
    class="category-icon"
    :style="{ width: `${size}px`, height: `${size}px`, color: displayColor, backgroundColor: background }"
    role="img"
    :aria-label="label"
  >
    <img
      v-if="customIconDataUri"
      class="category-icon__custom"
      :src="customIconDataUri"
      alt=""
      aria-hidden="true"
    />
    <component
      :is="icon.component"
      v-else-if="icon.component"
      :size="Math.round(size * 0.52)"
      :stroke-width="1.9"
      aria-hidden="true"
    />
    <svg
      v-else
      class="category-icon__filled"
      :width="Math.round(size * 0.54)"
      :height="Math.round(size * 0.54)"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path :d="icon.path" fill="currentColor" />
    </svg>
  </span>
</template>

<style scoped>
.category-icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
}

.category-icon__custom {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.category-icon__filled {
  display: block;
}
</style>
