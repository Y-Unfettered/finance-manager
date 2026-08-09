<script setup lang="ts">
import {
  BadgeDollarSign,
  Banknote,
  Bitcoin,
  CakeSlice,
  ChartCandlestick,
  CircleEllipsis,
  Coins,
  CreditCard,
  Dumbbell,
  HeartPulse,
  Landmark,
  PiggyBank,
  Scissors,
  Store,
  TicketCheck,
  TrainFront,
  Utensils,
  Vault,
  WalletCards,
  type LucideIcon,
} from '@lucide/vue'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    symbol: string
    color: string
    brandKey?: string
    foreground?: string
    size?: 'small' | 'medium' | 'large'
  }>(),
  {
    brandKey: '',
    foreground: '#ffffff',
    size: 'medium',
  },
)

type BrandMode = 'bank' | 'brand' | 'custom' | 'functional' | 'wordmark'

interface BrandProfile {
  key: string
  mode: BrandMode
  asset?: string
  badge?: string
  wordmark?: string
  icon?: LucideIcon
  foreground?: string
  background?: string
}

const assetModules = import.meta.glob<string>('../assets/account-icons/**/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const bankKeys = new Set([
  'boc',
  'cmb',
  'icbc',
  'abc',
  'ccb',
  'bocom',
  'spdb',
  'cgb',
  'psbc',
  'rcc',
  'pingan',
  'citic',
  'cib',
  'ceb',
  'cmbc',
  'hxb',
  'bob',
  'cdcb',
])

const aliases: Record<string, string> = {
  零钱通: 'wechat-balance',
  微信零钱通: 'wechat-balance',
  'yu-ebao': 'yu-ebao',
  余额宝: 'yu-ebao',
  'yu-libao': 'yu-libao',
  余利宝: 'yu-libao',
  小荷包: 'pocket',
  支付宝小荷包: 'pocket',
  花呗: 'huabei',
  借呗: 'jiebei',
  京东白条: 'jd-credit',
  白条: 'jd-credit',
  美团月付: 'meituan',
  抖音月付: 'douyin',
  微信分付: 'weixin-pay',
  中国银行: 'boc',
  招商银行: 'cmb',
  工商银行: 'icbc',
  农业银行: 'abc',
  建设银行: 'ccb',
  交通银行: 'bocom',
  浦发银行: 'spdb',
  广发银行: 'cgb',
  邮政储蓄银行: 'psbc',
  农村信用社: 'rcc',
  四川农村信用社: 'rcc',
  四川农信: 'rcc',
  平安银行: 'pingan',
  中信银行: 'citic',
  兴业银行: 'cib',
  光大银行: 'ceb',
  民生银行: 'cmbc',
  华夏银行: 'hxb',
  北京银行: 'bob',
  成都银行: 'cdcb',
}

const functionalIcons: Record<string, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  fund: Vault,
  medical: HeartPulse,
  'other-funds': WalletCards,
  'credit-card': CreditCard,
  'other-credit': BadgeDollarSign,
  prepaid: TicketCheck,
  'food-card': Utensils,
  'hair-card': Scissors,
  'cake-card': CakeSlice,
  'fitness-card': Dumbbell,
  'transit-card': TrainFront,
  'other-prepaid': Store,
  stock: ChartCandlestick,
  funds: PiggyBank,
  bond: BadgeDollarSign,
  wealth: Vault,
  gold: Coins,
  digital: Bitcoin,
  'other-investment': CircleEllipsis,
  'other-bank': Landmark,
  generic: WalletCards,
}

function normalizeKey(): string {
  const provided = props.brandKey.trim().toLowerCase()
  if (provided) return aliases[provided] ?? provided
  const source = `${props.label} ${props.symbol}`.toLowerCase()
  const match = Object.entries(aliases).find(([name]) => source.includes(name.toLowerCase()))
  return match?.[1] ?? 'generic'
}

function profileFor(key: string): BrandProfile {
  if (bankKeys.has(key)) {
    return { key, mode: 'bank', asset: `banks/${key}.png`, background: '#ffffff' }
  }

  const branded: Record<string, BrandProfile> = {
    alipay: { key, mode: 'brand', asset: 'brands/alipay.svg' },
    'yu-ebao': { key, mode: 'brand', asset: 'brands/alipay.svg', badge: '余' },
    'yu-libao': { key, mode: 'brand', asset: 'brands/alipay.svg', badge: '利' },
    pocket: { key, mode: 'brand', asset: 'brands/alipay.svg', badge: '荷' },
    wechat: { key, mode: 'brand', asset: 'brands/wechat.svg' },
    'wechat-balance': { key, mode: 'brand', asset: 'brands/wechat.svg', badge: '通' },
    'weixin-pay': { key, mode: 'brand', asset: 'brands/wechat.svg', badge: '分' },
    huabei: { key, mode: 'brand', asset: 'brands/alipay.svg', badge: '花' },
    jiebei: { key, mode: 'brand', asset: 'brands/alipay.svg', badge: '借' },
    huawei: { key, mode: 'brand', asset: 'brands/huawei.svg' },
    paypal: { key, mode: 'brand', asset: 'brands/paypal.svg' },
    meituan: { key, mode: 'brand', asset: 'brands/meituan.svg', badge: '月' },
    douyin: { key, mode: 'brand', asset: 'brands/tiktok.svg', badge: '月' },
    unionpay: {
      key,
      mode: 'bank',
      asset: 'brands/unionpay.svg',
      background: '#ffffff',
    },
    pdd: { key, mode: 'wordmark', wordmark: '多', background: '#e02e24' },
    'jd-credit': { key, mode: 'wordmark', wordmark: 'JD', background: '#e1251b' },
    ecny: { key, mode: 'wordmark', wordmark: 'e¥', background: '#cf2c31' },
  }
  if (branded[key]) return branded[key]
  return { key, mode: 'functional', icon: functionalIcons[key] ?? WalletCards }
}

const customIconDataUri = computed(() =>
  /^data:image\/(?:png|jpeg|webp);base64,/i.test(props.symbol) ? props.symbol : '',
)
const profile = computed<BrandProfile>(() =>
  customIconDataUri.value
    ? { key: 'custom-upload', mode: 'custom', background: '#ffffff' }
    : profileFor(normalizeKey()),
)
const assetUrl = computed(() => {
  if (!profile.value.asset) return ''
  return assetModules[`../assets/account-icons/${profile.value.asset}`] ?? ''
})
const pixelSize = computed(() => ({ small: 22, medium: 28, large: 32 })[props.size])
const innerSize = computed(() => Math.round(pixelSize.value * 0.54))
const backgroundColor = computed(
  () => profile.value.background ?? props.color ?? 'var(--color-primary-600)',
)
const foregroundColor = computed(() => profile.value.foreground ?? props.foreground)
</script>

<template>
  <span
    class="brand-icon"
    :class="[`brand-icon--${size}`, `brand-icon--${profile.mode}`]"
    :style="{ backgroundColor, color: foregroundColor }"
    role="img"
    :aria-label="label"
    :title="label"
  >
    <img
      v-if="profile.mode === 'custom' && customIconDataUri"
      class="brand-icon__custom"
      :src="customIconDataUri"
      alt=""
      aria-hidden="true"
    />
    <img
      v-else-if="profile.mode === 'bank' && assetUrl"
      class="brand-icon__bank"
      :src="assetUrl"
      alt=""
      aria-hidden="true"
    />
    <img
      v-else-if="profile.mode === 'brand' && assetUrl"
      class="brand-icon__logo"
      :src="assetUrl"
      alt=""
      aria-hidden="true"
    />
    <span v-else-if="profile.mode === 'wordmark'" class="brand-icon__word" aria-hidden="true">
      {{ profile.wordmark }}
    </span>
    <component
      :is="profile.icon"
      v-else-if="profile.icon"
      :size="innerSize"
      :stroke-width="2"
      aria-hidden="true"
    />
    <span v-if="profile.badge" class="brand-icon__badge" aria-hidden="true">{{
      profile.badge
    }}</span>
  </span>
</template>

<style scoped>
.brand-icon {
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  line-height: 1;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 5%);
}

.brand-icon--small {
  width: 22px;
  height: 22px;
}

.brand-icon--medium {
  width: 28px;
  height: 28px;
}

.brand-icon--large {
  width: 32px;
  height: 32px;
}

.brand-icon--bank {
  padding: 0;
}

.brand-icon__bank {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-icon__custom {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-icon__logo {
  display: block;
  width: 58%;
  height: 58%;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

.brand-icon__word {
  font-weight: 800;
  letter-spacing: -0.06em;
}

.brand-icon--small .brand-icon__word {
  font-size: 8px;
}

.brand-icon--medium .brand-icon__word {
  font-size: 10px;
}

.brand-icon--large .brand-icon__word {
  font-size: 11px;
}

.brand-icon__badge {
  position: absolute;
  right: -1px;
  bottom: -1px;
  display: grid;
  width: 43%;
  height: 43%;
  place-items: center;
  color: v-bind(backgroundColor);
  font-size: 8px;
  font-weight: 800;
  background: white;
  border: 1px solid rgb(0 0 0 / 7%);
  border-radius: 50%;
}
</style>
