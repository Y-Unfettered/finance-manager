<script setup lang="ts">
import {
  Baby,
  Banknote,
  BookOpen,
  Bus,
  Car,
  CircleEllipsis,
  Coffee,
  Gamepad2,
  Gift,
  HeartPulse,
  House,
  PawPrint,
  Plane,
  Shirt,
  ShoppingBag,
  Sparkles,
  Utensils,
  Wallet,
  Wine,
  type LucideIcon,
} from '@lucide/vue'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    iconKey?: string
    color?: string
    size?: number
    label?: string
  }>(),
  { iconKey: 'circle-ellipsis', color: '#5b8def', size: 42, label: '分类' },
)

const icons: Record<string, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  shirt: Shirt,
  bus: Bus,
  plane: Plane,
  baby: Baby,
  'paw-print': PawPrint,
  phone: ShoppingBag,
  wine: Wine,
  book: BookOpen,
  house: House,
  sparkles: Sparkles,
  hospital: HeartPulse,
  gift: Gift,
  car: Car,
  gamepad: Gamepad2,
  wallet: Wallet,
  banknote: Banknote,
  'circle-ellipsis': CircleEllipsis,
}
const icon = computed(() => icons[props.iconKey] ?? CircleEllipsis)
const background = computed(() => `${props.color}1f`)
</script>

<template>
  <span
    class="category-icon"
    :style="{ width: `${size}px`, height: `${size}px`, color, backgroundColor: background }"
    role="img"
    :aria-label="label"
  >
    <component :is="icon" :size="Math.round(size * 0.52)" :stroke-width="1.9" aria-hidden="true" />
  </span>
</template>

<style scoped>
.category-icon {
  display: inline-grid;
  flex: none;
  place-items: center;
  border-radius: 50%;
}
</style>
