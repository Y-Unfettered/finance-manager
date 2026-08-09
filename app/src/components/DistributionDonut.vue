<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  points: readonly { id: string; name: string; amountMinor: number }[]
}>()

const selectedId = ref<string>()
const colors = [
  'var(--color-primary-500)',
  '#d8a248',
  '#5b8def',
  '#d45f5a',
  '#8a73bd',
  '#55a6a6',
]
const positivePoints = computed(() => props.points.filter((point) => point.amountMinor > 0))
const total = computed(() =>
  positivePoints.value.reduce((sum, point) => sum + point.amountMinor, 0),
)
const selected = computed(
  () =>
    positivePoints.value.find((point) => point.id === selectedId.value) ?? positivePoints.value[0],
)
const background = computed(() => {
  if (!total.value) return 'var(--color-primary-50)'
  let cursor = 0
  const stops = positivePoints.value.map((point, index) => {
    const start = cursor
    cursor += (point.amountMinor / total.value) * 100
    return `${colors[index % colors.length]} ${start}% ${cursor}%`
  })
  return `conic-gradient(${stops.join(',')})`
})

watch(
  positivePoints,
  (points) => {
    if (!points.some((point) => point.id === selectedId.value)) selectedId.value = points[0]?.id
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="positivePoints.length" class="donut-layout">
    <div class="donut" :style="{ background }">
      <span>
        <small>{{ selected?.name ?? '合计' }}</small>
        <strong>¥{{ ((selected?.amountMinor ?? total) / 100).toFixed(2) }}</strong>
      </span>
    </div>
    <div class="legend">
      <button
        v-for="(point, index) in positivePoints"
        :key="point.id"
        type="button"
        :class="{ active: selected?.id === point.id }"
        @click="selectedId = point.id"
      >
        <i :style="{ background: colors[index % colors.length] }" />
        <span>{{ point.name }}</span>
        <strong>{{ ((point.amountMinor / total) * 100).toFixed(1) }}%</strong>
      </button>
    </div>
  </div>
</template>

<style scoped>
.donut-layout {
  display: grid;
  grid-template-columns: 126px 1fr;
  align-items: center;
  gap: var(--space-4);
}
.donut {
  display: grid;
  width: 126px;
  height: 126px;
  place-items: center;
  border-radius: 50%;
}
.donut > span {
  display: grid;
  width: 82px;
  height: 82px;
  padding: var(--space-2);
  place-items: center;
  align-content: center;
  overflow: hidden;
  text-align: center;
  background: var(--color-surface);
  border-radius: 50%;
}
.donut small {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.donut strong {
  font-size: var(--type-label-size);
}
.legend {
  display: grid;
  max-height: 154px;
  overflow-y: auto;
}
.legend button {
  display: grid;
  min-height: 34px;
  padding: 0 var(--space-1);
  grid-template-columns: 8px 1fr auto;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
}
.legend button.active {
  color: var(--color-text-primary);
  background: var(--color-primary-50);
}
.legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.legend strong {
  font-size: var(--type-caption-size);
}
</style>
