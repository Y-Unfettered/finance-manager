<script setup lang="ts">
import {
  ShieldCheck,
  Bell,
  Image as ImageIcon,
  Settings as SettingsIcon,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
  AlertTriangle,
} from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import {
  getServiceHealth,
  openAccessibilitySettings,
  openNotificationAccessSettings,
  runSelfTest,
} from '@/features/capture-inbox/capture-inbox-service'
import type { ServiceHealth } from '@/features/payment-capture/payment-capture-reader'

const router = useRouter()

const health = ref<ServiceHealth | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const selfTestRunning = ref(false)
const selfTestResult = ref<string | null>(null)

async function load(): Promise<void> {
  loadError.value = null
  try {
    loading.value = true
    const timeout = new Promise<ServiceHealth>((_, reject) =>
      setTimeout(() => reject(new Error('getServiceHealth 超时（5秒无响应）')), 5000),
    )
    const result = await Promise.race([getServiceHealth(), timeout])
    console.log('[CaptureSettings] getServiceHealth ok:', JSON.stringify(result))
    health.value = result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[CaptureSettings] getServiceHealth error:', msg)
    loadError.value = `加载失败: ${msg}`
    health.value = null
  } finally {
    loading.value = false
  }
}

async function doSelfTest(): Promise<void> {
  selfTestRunning.value = true
  selfTestResult.value = null
  try {
    const result = await runSelfTest()
    if (result.success) {
      selfTestResult.value = '自检成功，已写入测试记录'
    } else {
      selfTestResult.value = `自检失败: ${result.message}`
    }
  } catch (e) {
    selfTestResult.value = `自检异常: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    selfTestRunning.value = false
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'enabled':
      return '已启用'
    case 'disabled':
      return '未启用'
    case 'available':
      return '可用'
    case 'not_available':
      return '不可用'
    case 'error':
      return '错误'
    default:
      return status
  }
}

onMounted(load)
</script>

<template>
  <main class="capture-settings">
    <div class="safe-top">
      <AppTopBar title="自动记账设置" :show-back="true" @on-back="router.back()" />
    </div>

    <div class="capture-settings__body">
      <p class="capture-settings__intro">
        开启后，支付宝/微信支付完成后会自动识别并弹窗确认入账。
      </p>

      <template v-if="loading">
        <div class="loading-spinner">
          <Loader2 :size="28" />
        </div>
      </template>

      <template v-else-if="loadError">
        <BaseCard class="error-card">
          <div class="error-content">
            <AlertTriangle :size="20" />
            <span>{{ loadError }}</span>
          </div>
          <button class="error-retry" @click="load">重试</button>
        </BaseCard>
      </template>

      <template v-else-if="health">
        <!-- 通道状态 -->
        <section>
          <h2>检测通道</h2>

          <BaseCard class="channel-card">
            <div class="channel-row">
              <span class="channel-icon channel-icon--accessibility">
                <ShieldCheck :size="22" />
              </span>
              <div class="channel-info">
                <strong>无障碍服务</strong>
                <small>
                  监听支付宝/微信支付成功页，自动识别金额和商户
                </small>
              </div>
              <span
                class="channel-status"
                :class="health.accessibility.enabled ? 'channel-status--on' : 'channel-status--off'"
              >
                <CheckCircle v-if="health.accessibility.enabled" :size="18" />
                <XCircle v-else :size="18" />
                {{ statusLabel(health.accessibility.status) }}
              </span>
            </div>
            <button class="channel-action" @click="openAccessibilitySettings">
              <SettingsIcon :size="16" />
              前往系统设置启用
              <ChevronRight :size="18" />
            </button>
          </BaseCard>

          <BaseCard class="channel-card">
            <div class="channel-row">
              <span class="channel-icon channel-icon--notification">
                <Bell :size="22" />
              </span>
              <div class="channel-info">
                <strong>通知监听</strong>
                <small>
                  兜底方案，从通知栏捕获支付成功消息
                </small>
              </div>
              <span
                class="channel-status"
                :class="health.notification.enabled ? 'channel-status--on' : 'channel-status--off'"
              >
                <CheckCircle v-if="health.notification.enabled" :size="18" />
                <XCircle v-else :size="18" />
                {{ statusLabel(health.notification.status) }}
              </span>
            </div>
            <button class="channel-action" @click="openNotificationAccessSettings">
              <SettingsIcon :size="16" />
              前往系统设置授权
              <ChevronRight :size="18" />
            </button>
          </BaseCard>

          <BaseCard class="channel-card">
            <div class="channel-row">
              <span class="channel-icon channel-icon--ocr">
                <ImageIcon :size="22" />
              </span>
              <div class="channel-info">
                <strong>分享 OCR</strong>
                <small>
                  从其他 APP 分享支付截图，本地 OCR 识别金额
                </small>
              </div>
              <span class="channel-status channel-status--on">
                <CheckCircle :size="18" />
                {{ statusLabel(health.ocr.status) }}
              </span>
            </div>
          </BaseCard>
        </section>

        <!-- 待处理统计 -->
        <section>
          <h2>待处理</h2>
          <BaseCard class="stat-card">
            <div class="stat-row">
              <span class="stat-label">待确认账单</span>
              <span class="stat-value">
                {{ health.pendingCount }} 条
              </span>
              <button
                v-if="health.pendingCount > 0"
                class="stat-action"
                @click="router.push({ name: 'capture-inbox' })"
              >
                立即处理
                <ChevronRight :size="16" />
              </button>
            </div>
          </BaseCard>
        </section>

        <!-- 自检 -->
        <section>
          <h2>诊断</h2>
          <BaseCard class="diag-card">
            <div class="diag-row">
              <div>
                <strong>捕获队列自检</strong>
                <small>写入一条测试记录验证队列功能是否正常</small>
              </div>
              <button
                class="diag-btn"
                :disabled="selfTestRunning"
                @click="doSelfTest"
              >
                <Loader2 v-if="selfTestRunning" :size="16" class="spinner" />
                <span v-else>运行自检</span>
              </button>
            </div>
            <p v-if="selfTestResult" class="diag-result">
              <CheckCircle v-if="selfTestResult.startsWith('自检成功')" :size="14" />
              <AlertTriangle v-else :size="14" />
              {{ selfTestResult }}
            </p>
          </BaseCard>
        </section>

        <!-- 使用提示 -->
        <section>
          <h2>使用提示</h2>
          <BaseCard class="tip-card">
            <ol class="tip-list">
              <li>
                <strong>方式一：自动捕获</strong>
                <span>在支付宝/微信完成支付后，无障碍服务会自动识别支付成功页信息。</span>
              </li>
              <li>
                <strong>方式二：分享截图</strong>
                <span>长按支付截图，选择「分享」→ 财务经理，OCR 自动识别金额。</span>
              </li>
              <li>
                <strong>方式三：粘贴 JSON</strong>
                <span>通过豆包 AI 识别截图后，复制 JSON 结果，APP 会自动弹出导入框。</span>
              </li>
              <li>
                <strong>方式四：手动记账</strong>
                <span>首页点击「+」按钮，手动输入金额、分类和备注。</span>
              </li>
            </ol>
          </BaseCard>
        </section>

        <p class="privacy-note">
          自动捕获仅读取支付成功页文本和通知栏消息，不收集银行账号、密码等敏感信息。
        </p>
      </template>
    </div>
  </main>
</template>

<style scoped>
.capture-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.capture-settings__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
}

.capture-settings__intro {
  margin: 0 0 var(--space-4);
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  line-height: 1.6;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
}

.loading-spinner {
  display: flex;
  justify-content: center;
  padding: 48px;
  color: var(--color-text-tertiary);
}

.loading-spinner .spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--type-section-title-size);
}

section {
  margin-bottom: var(--space-5);
}

/* 通道卡片 */
.channel-card {
  padding: 0 var(--space-4);
}

.channel-row {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 68px;
}

.channel-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  background: var(--color-primary-50);
  color: var(--color-primary-600);
}

.channel-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.channel-info strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.channel-info small {
  font-size: 13px;
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

.channel-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.channel-status--on {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
}

.channel-status--off {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.channel-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-divider);
  border-right: 0;
  border-bottom: 0;
  border-left: 0;
  background: none;
  color: var(--color-primary-600);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}

/* 统计卡片 */
.stat-card {
  padding: var(--space-4);
}

.stat-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.stat-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-primary-600);
}

.stat-action {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

/* 诊断卡片 */
.diag-card {
  padding: var(--space-4);
}

.diag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.diag-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.diag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.diag-btn .spinner {
  animation: spin 1s linear infinite;
}

.diag-result {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  font-size: 13px;
  color: var(--color-text);
}

/* 使用提示 */
.tip-card {
  padding: var(--space-4);
}

.tip-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding-left: 0;
  list-style: none;
  counter-reset: tip;
}

.tip-list li {
  counter-increment: tip;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 24px;
  position: relative;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
}

.tip-list li::before {
  content: counter(tip);
  position: absolute;
  left: 0;
  top: 1px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  background: var(--color-primary-50);
  color: var(--color-primary-600);
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
}

.tip-list li strong {
  font-weight: 600;
  font-size: 14px;
}

.tip-list li span {
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.privacy-note {
  margin: var(--space-4) 0 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
  text-align: center;
  line-height: 1.5;
}
</style>