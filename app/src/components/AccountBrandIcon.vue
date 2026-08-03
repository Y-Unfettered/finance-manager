<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    symbol: string
    color: string
    foreground?: string
    size?: 'small' | 'medium' | 'large'
  }>(),
  {
    foreground: '#ffffff',
    size: 'medium',
  },
)
</script>

<template>
  <span
    class="brand-icon"
    :class="`brand-icon--${size}`"
    :style="{ backgroundColor: color, color: foreground }"
    role="img"
    :aria-label="label"
  >
    {{ symbol }}
  </span>
</template>

<style scoped>
.brand-icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  font-weight: 700;
  line-height: 1;
  border-radius: var(--radius-pill);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 18%);
}

.brand-icon--small {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.brand-icon--medium {
  width: 40px;
  height: 40px;
  font-size: 14px;
}

.brand-icon--large {
  width: 48px;
  height: 48px;
  font-size: 16px;
}
</style>
