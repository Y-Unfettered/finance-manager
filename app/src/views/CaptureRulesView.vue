<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, RefreshCw } from '@lucide/vue'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import {
  captureAppName,
  loadRuleConfig,
  type CaptureRule,
} from '@/features/capture-rules/capture-rule-config-service'

const router = useRouter()

const loading = ref(true)
const errorMsg = ref('')
const version = ref(0)
const groups = ref<{ pkg: string; rules: CaptureRule[] }[]>([])

const appCards = computed(() =>
  groups.value.map((g) => ({
    pkg: g.pkg,
    name: captureAppName(g.pkg),
    total: g.rules.length,
    enabled: g.rules.filter((r) => r.enabled).length,
  })),
)

async function load(): Promise<void> {
  loading.value = true
  errorMsg.value = ''
  try {
    const config = await loadRuleConfig()
    version.value = config.version
    const byPkg = new Map<string, CaptureRule[]>()
    for (const rule of config.rules) {
      const list = byPkg.get(rule.packageName) ?? []
      list.push(rule)
      byPkg.set(rule.packageName, list)
    }
    groups.value = [...byPkg.entries()]
      .map(([pkg, rules]) => ({ pkg, rules }))
      .sort((a, b) => captureAppName(a.pkg).localeCompare(captureAppName(b.pkg), 'zh'))
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '规则加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="rules-page">
    <div class="safe-top rules-safe">
      <AppTopBar title="匹配规则" :show-back="true" @on-back="router.back()" />
    </div>

    <div class="content">
      <div v-if="loading" class="state">正在读取规则…</div>
      <div v-else-if="errorMsg" class="state state--error">
        {{ errorMsg }}
        <button type="button" class="state__retry" @click="load">
          <RefreshCw :size="14" /> 重试
        </button>
      </div>

      <template v-else>
        <p class="page-hint">
          自动记账按这些模板识别支付/账单页面。规则版本 <strong>v{{ version }}</strong
          >，调整或新增后此处自动更新。
        </p>

        <BaseCard v-for="app in appCards" :key="app.pkg" class="app-card">
          <button type="button" class="app-card__btn" @click="router.push(`/settings/capture-rules/${encodeURIComponent(app.pkg)}`)">
            <span class="app-card__info">
              <strong>{{ app.name }}</strong>
              <small>
                {{ app.total }} 个模板 · 启用 {{ app.enabled }}
                {{ app.total - app.enabled > 0 ? `· 禁用 ${app.total - app.enabled}` : '' }}
              </small>
            </span>
            <ChevronRight :size="19" />
          </button>
        </BaseCard>

        <p v-if="!groups.length" class="state">暂无规则</p>
      </template>
    </div>
  </main>
</template>

<style scoped>
.rules-page {
  min-height: 100dvh;
  background: var(--color-background);
}

.rules-safe {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.content {
  display: grid;
  gap: var(--space-3);
  max-width: 520px;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: 0 auto;
}

.page-hint {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line);
}

.page-hint strong {
  color: var(--color-text-secondary);
}

.app-card__btn {
  display: grid;
  width: 100%;
  min-height: 64px;
  grid-template-columns: 1fr 20px;
  align-items: center;
  gap: var(--space-3);
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}

.app-card__btn > svg {
  color: var(--color-text-tertiary);
}

.app-card__info {
  display: grid;
  gap: 2px;
}

.app-card__info strong {
  font-size: var(--type-list-primary-size);
  font-weight: 500;
}

.app-card__info small {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}

.state {
  padding: var(--space-8) var(--space-4);
  color: var(--color-text-tertiary);
  font-size: var(--type-body-size);
  text-align: center;
}

.state--error {
  color: var(--color-danger);
}

.state__retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 auto;
  padding: 6px 14px;
  color: var(--color-primary-600);
  font-size: var(--type-caption-size);
  background: var(--color-primary-50);
  border: 1px solid var(--color-primary-100);
  border-radius: var(--radius-pill);
}
</style>
