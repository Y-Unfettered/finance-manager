<script setup lang="ts">
import { CalendarDays, Ellipsis, Landmark, ListFilter, WalletCards } from '@lucide/vue'
import { ref } from 'vue'

import AccountAvatar from '@/components/AccountAvatar.vue'
import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import MoneyText from '@/components/MoneyText.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const showPeriod = ref(false)
const showFilter = ref(false)
</script>

<template>
  <main class="foundation-page">
    <div class="foundation-page__safe-top">
      <AppTopBar
        title="2026年8月"
        :show-back="false"
        period-switchable
        @select-period="showPeriod = true"
      >
        <template #right>
          <AppIconButton label="筛选" @click="showFilter = true">
            <ListFilter :size="24" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </template>
      </AppTopBar>
    </div>

    <div class="foundation-page__content">
      <div class="foundation-page__intro">
        <span class="foundation-page__eyebrow">SPRINT 0 · V{{ appStore.version }}</span>
        <h1>工程与设计系统基线</h1>
        <p>本页用于验证字号、颜色、卡片、账户图标、金额和移动弹层，不是正式业务首页。</p>
      </div>

      <BaseCard variant="summary">
        <div class="summary-card__header">
          <span>示例净资产</span>
          <AppIconButton label="更多操作">
            <Ellipsis :size="24" :stroke-width="1.75" aria-hidden="true" />
          </AppIconButton>
        </div>
        <MoneyText class="summary-card__amount" :amount-minor="28643080" />
        <div class="summary-card__metrics">
          <span>总资产 ¥312,860.80</span>
          <span>总负债 ¥26,430.00</span>
        </div>
      </BaseCard>

      <BaseCard>
        <h2 class="section-title">账户组件</h2>
        <div class="account-row">
          <AccountAvatar label="招商银行">
            <Landmark :size="24" :stroke-width="1.75" aria-hidden="true" />
          </AccountAvatar>
          <div class="account-row__text">
            <strong>招商银行</strong>
            <span>银行卡</span>
          </div>
          <MoneyText :amount-minor="2860000" />
        </div>
        <div class="account-row">
          <AccountAvatar label="微信余额" tone="info">
            <WalletCards :size="24" :stroke-width="1.75" aria-hidden="true" />
          </AccountAvatar>
          <div class="account-row__text">
            <strong>微信余额</strong>
            <span>平台账户</span>
          </div>
          <MoneyText :amount-minor="1208050" />
        </div>
      </BaseCard>

      <BaseCard>
        <h2 class="section-title">金额状态</h2>
        <div class="money-demo-row">
          <span>工资</span>
          <MoneyText :amount-minor="1860000" tone="income" show-plus />
        </div>
        <div class="money-demo-row">
          <span>餐饮</span>
          <MoneyText :amount-minor="-3800" tone="expense" />
        </div>
      </BaseCard>
    </div>

    <AppBottomSheet v-model:show="showPeriod" title="选择账期">
      <div class="sheet-placeholder">
        <CalendarDays :size="24" :stroke-width="1.75" aria-hidden="true" />
        <span>账期选择器将在后续业务版本接入 Vant DatePicker。</span>
      </div>
    </AppBottomSheet>

    <AppBottomSheet v-model:show="showFilter" title="筛选">
      <div class="sheet-placeholder">
        <ListFilter :size="24" :stroke-width="1.75" aria-hidden="true" />
        <span>筛选表单将在流水功能完成后接入。</span>
      </div>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.foundation-page {
  min-height: 100dvh;
  padding-bottom: calc(var(--space-8) + env(safe-area-inset-bottom));
  background: var(--color-background);
}

.foundation-page__safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.foundation-page__content {
  display: grid;
  max-width: 520px;
  padding: var(--space-6) var(--page-gutter);
  margin: 0 auto;
  gap: var(--space-3);
}

.foundation-page__intro {
  margin-bottom: var(--space-2);
}

.foundation-page__eyebrow {
  color: var(--color-primary-600);
  font-size: var(--type-label-size);
  font-weight: 600;
  line-height: var(--type-label-line);
  letter-spacing: 0.04em;
}

.foundation-page__intro h1 {
  margin: var(--space-2) 0 var(--space-2);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}

.foundation-page__intro p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
}

.summary-card__header {
  display: flex;
  height: 32px;
  align-items: center;
  justify-content: space-between;
  font-size: var(--type-section-title-size);
  font-weight: 600;
}

.summary-card__amount {
  display: block;
  margin-top: var(--space-2);
  font-size: var(--type-money-display-size);
  font-weight: 600;
  line-height: var(--type-money-display-line);
}

.summary-card__metrics {
  display: flex;
  margin-top: var(--space-3);
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}

.section-title {
  margin: 0 0 var(--space-2);
  font-size: var(--type-section-title-size);
  font-weight: 600;
  line-height: var(--type-section-title-line);
}

.account-row,
.money-demo-row {
  display: flex;
  min-height: 56px;
  align-items: center;
  gap: var(--space-3);
  border-top: 1px solid var(--color-divider);
}

.account-row__text {
  display: grid;
  flex: 1;
  gap: 2px;
}

.account-row__text strong,
.money-demo-row > span:first-child {
  font-size: var(--type-list-primary-size);
  font-weight: 500;
  line-height: var(--type-list-primary-line);
}

.account-row__text span {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}

.money-demo-row {
  justify-content: space-between;
}

.sheet-placeholder {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
  text-align: center;
}
</style>
