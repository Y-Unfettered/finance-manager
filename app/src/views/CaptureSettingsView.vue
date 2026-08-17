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
  RotateCcw,
  Activity,
} from '@lucide/vue'
import { onActivated, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import {
  getServiceHealth,
  openAccessibilitySettings,
  openNotificationAccessSettings,
  runSelfTest,
  enableAccessibilityViaShizuku,
  requestShizukuPermission,
  diagnosePlugin,
  exportDiagnosticLog,
  shareDiagnosticLog,
  getAccessibilityDiagnostics,
  getNotificationDiagnostics,
  resetDiagnostics,
} from '@/features/capture-inbox/capture-inbox-service'
import type {
  ServiceHealth,
  AccessibilityDiagnosticsResult,
  NotificationDiagnosticsResult,
} from '@/features/payment-capture/payment-capture-reader'

const router = useRouter()

const health = ref<ServiceHealth | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const selfTestRunning = ref(false)
const selfTestResult = ref<string | null>(null)
const diagnoseInfo = ref<unknown | null>(null)
const diagExporting = ref(false)
const diagExportResult = ref<string | null>(null)

// 诊断面板状态
const a11yDiag = ref<AccessibilityDiagnosticsResult | null>(null)
const notifDiag = ref<NotificationDiagnosticsResult | null>(null)
const showA11yRing = ref(false)
const showNotifRing = ref(false)
const diagLoading = ref(false)
let pollingTimer: number | null = null

async function doResetDiag(): Promise<void> {
  try {
    await resetDiagnostics()
    await load()
    await loadA11yDiagnostics()
    await loadNotifDiagnostics()
    selfTestResult.value = '诊断数据已重置'
  } catch (e) {
    selfTestResult.value = `重置失败: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function loadA11yDiagnostics(): Promise<void> {
  try {
    a11yDiag.value = await getAccessibilityDiagnostics()
  } catch {
    a11yDiag.value = null
  }
}

async function loadNotifDiagnostics(): Promise<void> {
  try {
    notifDiag.value = await getNotificationDiagnostics()
  } catch {
    notifDiag.value = null
  }
}

function startPollDiagnostics(): void {
  stopPollDiagnostics()
  void Promise.all([loadA11yDiagnostics(), loadNotifDiagnostics()])
  pollingTimer = window.setInterval(() => {
    void Promise.all([loadA11yDiagnostics(), loadNotifDiagnostics()])
  }, 2000)
}

function stopPollDiagnostics(): void {
  if (pollingTimer !== null) {
    window.clearInterval(pollingTimer)
    pollingTimer = null
  }
}

function fmtTs(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function a11yRingEntries(): string[] {
  if (!a11yDiag.value) return []
  return a11yDiag.value.ring.slice().reverse()
}

function notifRingEntries(): string[] {
  if (!notifDiag.value) return []
  return notifDiag.value.ring.slice().reverse()
}

async function load(): Promise<void> {
  loadError.value = null
  diagnoseInfo.value = null
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

    // 插件加载失败时，尝试诊断
    try {
      const diag = await diagnosePlugin()
      diagnoseInfo.value = diag
      console.error('[CaptureSettings] diagnose:', JSON.stringify(diag))
    } catch (de) {
      console.error('[CaptureSettings] diagnose error:', de)
    }
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

async function doShizukuEnable(): Promise<void> {
  try {
    const result = await enableAccessibilityViaShizuku()
    selfTestResult.value = result.message
    await load()
  } catch (e) {
    selfTestResult.value = `Shizuku 启用失败: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function doRequestShizukuPermission(): Promise<void> {
  try {
    const result = await requestShizukuPermission()
    selfTestResult.value = result.message || '已请求 Shizuku 授权，请确认弹窗'
    await load()
  } catch (e) {
    selfTestResult.value = `授权请求失败: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function doExportDiag(): Promise<void> {
  diagExporting.value = true
  diagExportResult.value = null
  try {
    const result = await exportDiagnosticLog()
    if (result.success) {
      diagExportResult.value = `日志已导出: ${result.fileName || result.filePath || 'diagnostic.json'}`
    } else {
      diagExportResult.value = `导出失败: ${result.message}`
    }
  } catch (e) {
    diagExportResult.value = `导出异常: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    diagExporting.value = false
  }
}

async function doShareDiag(): Promise<void> {
  diagExporting.value = true
  diagExportResult.value = null
  try {
    const result = await shareDiagnosticLog()
    if (result.success) {
      diagExportResult.value = result.message || '已打开分享面板'
    } else {
      diagExportResult.value = `分享失败: ${result.message}`
    }
  } catch (e) {
    diagExportResult.value = `分享异常: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    diagExporting.value = false
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

onMounted(() => {
  load()
  startPollDiagnostics()
})

onActivated(() => {
  load()
  startPollDiagnostics()
})

onUnmounted(() => {
  stopPollDiagnostics()
})
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
            <template v-if="health.shizuku && health.shizuku.available">
              <button class="channel-action channel-action--shizuku" @click="doShizukuEnable">
                <ShieldCheck :size="16" />
                通过 Shizuku 自动启用
                <ChevronRight :size="18" />
              </button>
            </template>
            <template v-else-if="health.shizuku && health.shizuku.running">
              <button class="channel-action channel-action--shizuku" @click="doRequestShizukuPermission">
                <AlertTriangle :size="16" />
                点击授权 Shizuku
                <ChevronRight :size="18" />
              </button>
            </template>
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

        <!-- 无障碍诊断面板 -->
        <section>
          <div class="diag-section-header">
            <h2>无障碍诊断</h2>
            <span class="diag-section-hint">
              <Activity :size="13" />
              实时显示每一步状态（2 秒刷新）
            </span>
          </div>
          <BaseCard class="diag-card">
            <div class="diag-note">
              下面数字是<em>无障碍服务进程</em>从最后一次被启动起累计的次数。
              <em>如果数字全是 0，说明进程还没起来或被系统杀死</em>——
              这时"最后连接时间"能帮你判断是不是被杀。
            </div>

            <div class="diag-grid">
              <div class="diag-cell">
                <span class="diag-cell__k">服务已连接</span>
                <span class="diag-cell__v">{{ a11yDiag?.counts.serviceConnected ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">服务已销毁</span>
                <span class="diag-cell__v">{{ a11yDiag?.counts.serviceDestroyed ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">收到事件</span>
                <span class="diag-cell__v">{{ a11yDiag?.counts.eventTotal ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">root=null</span>
                <span class="diag-cell__v warn">{{ a11yDiag?.counts.rootNull ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">文本为空</span>
                <span class="diag-cell__v warn">{{ a11yDiag?.counts.textEmpty ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">无关键词</span>
                <span class="diag-cell__v warn">{{ a11yDiag?.counts.noKeyword ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">无金额</span>
                <span class="diag-cell__v warn">{{ a11yDiag?.counts.noAmount ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">解析成功</span>
                <span class="diag-cell__v ok">{{ a11yDiag?.counts.parsed ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">去重</span>
                <span class="diag-cell__v">{{ a11yDiag?.counts.dedup ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">写入队列</span>
                <span class="diag-cell__v ok">{{ a11yDiag?.counts.queueInsert ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">写入失败</span>
                <span class="diag-cell__v warn">{{ a11yDiag?.counts.queueFail ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">无适配器</span>
                <span class="diag-cell__v warn">{{ a11yDiag?.counts.noAdapter ?? 0 }}</span>
              </div>
            </div>

            <div class="diag-persist">
              <div class="diag-persist__row">
                <span>重启次数</span>
                <span class="diag-persist__v">{{ a11yDiag?.persisted.restartCount ?? 0 }}</span>
              </div>
              <div class="diag-persist__row">
                <span>最后连接</span>
                <span class="diag-persist__v">{{ fmtTs(a11yDiag?.persisted.lastConnectedAt ?? 0) }}</span>
              </div>
              <div class="diag-persist__row">
                <span>最后销毁</span>
                <span class="diag-persist__v">{{ fmtTs(a11yDiag?.persisted.lastDestroyedAt ?? 0) }}</span>
              </div>
            </div>

            <div v-if="a11yDiag?.lastFailReason" class="diag-last-fail">
              <AlertTriangle :size="13" />
              最近失败：<code>{{ a11yDiag.lastFailReason }}</code>
            </div>

            <button class="diag-toggle" @click="showA11yRing = !showA11yRing">
              <Code :size="13" />
              事件日志
              <span class="diag-toggle__tip">{{ showA11yRing ? '收起' : `展开（${a11yDiag?.ring.length ?? 0} 条）` }}</span>
            </button>
            <div v-if="showA11yRing" class="diag-ring">
              <div v-if="a11yRingEntries().length === 0" class="diag-ring__empty">
                暂无日志——打开支付宝/微信触发一次支付成功后这里会出现记录
              </div>
              <div v-else class="diag-ring__entries">
                <div v-for="(e, i) in a11yRingEntries().slice(0, 30)" :key="i" class="diag-ring__entry">
                  <code>{{ e }}</code>
                </div>
              </div>
            </div>

            <div v-if="a11yDiag?.perPkg.length" class="diag-pkg">
              按包名统计：
              <span v-for="p in a11yDiag.perPkg" :key="p" class="diag-pkg__chip">
                {{ p }}
              </span>
            </div>
          </BaseCard>
        </section>

        <!-- 通知诊断面板 -->
        <section>
          <div class="diag-section-header">
            <h2>通知诊断</h2>
            <span class="diag-section-hint">
              <Activity :size="13" />
              实时显示通知监听每一步
            </span>
          </div>
          <BaseCard class="diag-card">
            <div class="diag-grid">
              <div class="diag-cell">
                <span class="diag-cell__k">已连接</span>
                <span class="diag-cell__v">{{ notifDiag?.counts.connected ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">已断开</span>
                <span class="diag-cell__v">{{ notifDiag?.counts.disconnected ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">收到通知</span>
                <span class="diag-cell__v">{{ notifDiag?.counts.notifTotal ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">无关键词</span>
                <span class="diag-cell__v warn">{{ notifDiag?.counts.noKeyword ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">无金额</span>
                <span class="diag-cell__v warn">{{ notifDiag?.counts.noAmount ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">解析成功</span>
                <span class="diag-cell__v ok">{{ notifDiag?.counts.parsed ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">去重</span>
                <span class="diag-cell__v">{{ notifDiag?.counts.dedup ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">写入队列</span>
                <span class="diag-cell__v ok">{{ notifDiag?.counts.queueInsert ?? 0 }}</span>
              </div>
              <div class="diag-cell">
                <span class="diag-cell__k">写入失败</span>
                <span class="diag-cell__v warn">{{ notifDiag?.counts.queueFail ?? 0 }}</span>
              </div>
            </div>

            <div class="diag-persist">
              <div class="diag-persist__row">
                <span>最后连接</span>
                <span class="diag-persist__v">{{ fmtTs(notifDiag?.persisted.lastConnectedAt ?? 0) }}</span>
              </div>
              <div class="diag-persist__row">
                <span>最后断开</span>
                <span class="diag-persist__v">{{ fmtTs(notifDiag?.persisted.lastDisconnectedAt ?? 0) }}</span>
              </div>
            </div>

            <button class="diag-toggle" @click="showNotifRing = !showNotifRing">
              <Code :size="13" />
              事件日志
              <span class="diag-toggle__tip">{{ showNotifRing ? '收起' : `展开（${notifDiag?.ring.length ?? 0} 条）` }}</span>
            </button>
            <div v-if="showNotifRing" class="diag-ring">
              <div v-if="notifRingEntries().length === 0" class="diag-ring__empty">
                暂无日志——触发一条支付通知后这里会出现记录
              </div>
              <div v-else class="diag-ring__entries">
                <div v-for="(e, i) in notifRingEntries().slice(0, 20)" :key="i" class="diag-ring__entry">
                  <code>{{ e }}</code>
                </div>
              </div>
            </div>
          </BaseCard>
        </section>

        <!-- 诊断工具栏 -->
        <section>
          <BaseCard class="diag-tools-card">
            <div class="diag-tools-btns">
              <button class="diag-tools-btn" :disabled="diagLoading" @click="doResetDiag">
                <RotateCcw :size="15" />
                清空诊断计数
              </button>
              <button class="diag-tools-btn diag-tools-btn--share" :disabled="diagLoading" @click="doShareDiag">
                <span class="diag-tools-btn__label">分享诊断日志</span>
              </button>
            </div>
            <p class="diag-tools-note">
              清空后所有计数归零，重新开始记录。<br/>
              分享诊断日志会生成一个 JSON 文件，包含设备信息、各通道状态、诊断计数和事件环形日志——
              分享出来就能把当前的诊断数据交给开发排查。
            </p>
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
            <div class="diag-row diag-row--export">
              <div>
                <strong>导出诊断日志</strong>
                <small>导出设备信息和服务状态供排查问题</small>
              </div>
              <div class="diag-export-btns">
                <button
                  class="diag-btn diag-btn--secondary"
                  :disabled="diagExporting"
                  @click="doExportDiag"
                >
                  <Loader2 v-if="diagExporting" :size="14" class="spinner" />
                  <span v-else>导出文件</span>
                </button>
                <button
                  class="diag-btn diag-btn--share"
                  :disabled="diagExporting"
                  @click="doShareDiag"
                >
                  <span>分享日志</span>
                </button>
              </div>
            </div>
            <p v-if="diagExportResult" class="diag-result">
              <CheckCircle v-if="diagExportResult.startsWith('日志已导出') || diagExportResult.startsWith('已打开')" :size="14" />
              <AlertTriangle v-else :size="14" />
              {{ diagExportResult }}
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

.channel-action--shizuku {
  border-top: 1px dashed var(--color-divider);
  color: #7c3aed;
  background: color-mix(in srgb, #7c3aed 6%, transparent);
}

.channel-action--shizuku-disabled {
  border-top: 1px dashed var(--color-divider);
  color: var(--color-text-tertiary);
  cursor: not-allowed;
  opacity: 0.7;
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

.diag-row--export {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-divider);
}

.diag-export-btns {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}

.diag-btn--secondary {
  background: transparent;
  color: var(--color-primary-600);
  border: 1px solid var(--color-primary-600);
}

.diag-btn--share {
  background: color-mix(in srgb, #7c3aed 12%, transparent);
  color: #7c3aed;
  border: 1px solid color-mix(in srgb, #7c3aed 40%, transparent);
}

.diag-btn--share:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 诊断面板通用 */
.diag-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
}

.diag-section-header h2 {
  margin: 0;
}

.diag-section-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary-600);
  font-size: 11px;
  font-weight: 500;
}

.diag-card {
  padding: 14px 14px;
}

.diag-note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-tertiary);
  padding: 8px 10px;
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  border-radius: 8px;
  margin-bottom: 12px;
}

.diag-note em {
  font-style: normal;
  color: var(--color-text);
  font-weight: 600;
}

.diag-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 12px;
}

.diag-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-line);
}

.diag-cell__k {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
  letter-spacing: 0.2px;
}

.diag-cell__v {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.diag-cell__v.warn {
  color: var(--color-danger);
}

.diag-cell__v.ok {
  color: var(--color-success);
}

.diag-persist {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-surface);
  border-radius: 8px;
  border: 1px dashed var(--color-line);
  margin-bottom: 10px;
}

.diag-persist__row {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diag-persist__row span:first-child {
  font-size: 10.5px;
  color: var(--color-text-tertiary);
}

.diag-persist__v {
  font-size: 13px;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--color-text);
}

.diag-last-fail {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text);
}

.diag-last-fail code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--color-danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.diag-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: none;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.diag-toggle__tip {
  margin-left: auto;
  color: var(--color-text-tertiary);
  font-size: 11px;
  font-weight: 400;
}

.diag-ring {
  margin-top: 8px;
  padding: 10px 12px;
  background: #1e1e1e;
  border-radius: 8px;
  color: #d4d4d4;
  max-height: 260px;
  overflow-y: auto;
}

.diag-ring__empty {
  font-size: 12px;
  color: #888;
  font-style: italic;
  padding: 4px 0;
}

.diag-ring__entries {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diag-ring__entry code {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: #9cdcfe;
  word-break: break-all;
}

.diag-pkg {
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--color-surface);
  border-radius: 8px;
  font-size: 11.5px;
  color: var(--color-text-tertiary);
  line-height: 1.5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.diag-pkg__chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-background);
  border: 1px solid var(--color-line);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--color-primary-600);
}

.diag-tools-card {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diag-tools-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.diag-tools-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-danger) 40%, transparent);
  color: var(--color-danger);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.diag-tools-btn--share {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
  color: var(--color-primary-600);
}

.diag-tools-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.diag-tools-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-tertiary);
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