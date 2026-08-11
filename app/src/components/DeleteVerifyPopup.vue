<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  show: boolean
  expectedNumber: string
  countLabel?: string
  deleting?: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: []
}>()

const verifyNumber = ref('')
const canConfirm = computed(() => verifyNumber.value.trim() === props.expectedNumber)
const inputEl = ref<HTMLInputElement | null>(null)

function close(): void {
  emit('update:show', false)
}

function confirm(): void {
  if (!canConfirm.value) return
  emit('confirm')
  close()
}

function onBlur(): void {
  if (canConfirm.value) confirm()
}

watch(() => props.show, (v) => {
  if (v) {
    verifyNumber.value = ''
    nextTick(() => {
      requestAnimationFrame(() => {
        inputEl.value?.focus()
      })
    })
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="dv-backdrop" @click.self="close">
      <div class="dv-popup" role="alertdialog">
        <div class="dv-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none"/>
          </svg>
        </div>
        <h3 class="dv-title">最终确认删除</h3>
        <p class="dv-desc">
          <template v-if="countLabel">{{ countLabel }}</template>
          <template v-else>删除后账目会回退，此操作不可恢复。</template>
        </p>
        <p class="dv-desc">请核对并输入下方的 4 位数字：</p>

        <div class="dv-number">
          <span v-for="(ch, i) in expectedNumber" :key="i" class="dv-digit">{{ ch }}</span>
        </div>

        <input
          ref="inputEl"
          v-model="verifyNumber"
          type="text"
          inputmode="numeric"
          maxlength="4"
          :placeholder="`输入 ${expectedNumber}`"
          class="dv-input"
          :aria-label="`请输入 ${expectedNumber}`"
          @input="verifyNumber = String(verifyNumber).replace(/[^0-9]/g, '').slice(0, 4)"
          @blur="onBlur"
        />

        <div class="dv-actions">
          <button type="button" class="dv-ghost" @click="close">取消</button>
          <button
            type="button"
            class="dv-danger"
            :class="{ 'dv-danger--disabled': !canConfirm || deleting }"
            :disabled="!canConfirm || deleting"
            @click="confirm"
          >{{ deleting ? '删除中…' : '确认删除' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.dv-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  z-index: 3000;
  padding: 120px 16px 16px 16px;
}
.dv-popup {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 320px;
  padding: 16px var(--space-5) var(--space-6);
  gap: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-card);
}
.dv-icon {
  display: flex;
  justify-content: center;
  color: var(--color-danger);
}
.dv-title {
  margin: 0;
  font-size: var(--type-section-title-size);
  font-weight: 600;
  text-align: center;
}
.dv-desc {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line);
  text-align: center;
}
.dv-number {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
}
.dv-digit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 56px;
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 2px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.dv-input {
  width: 100%;
  padding: 12px 16px;
  color: var(--color-text-primary);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 6px;
  text-align: center;
  background: transparent;
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
  outline: none;
}
.dv-input::placeholder {
  color: var(--color-text-tertiary);
  letter-spacing: 0;
}
.dv-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-top: var(--space-1);
}
.dv-ghost,
.dv-danger {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 46px;
  font-size: var(--type-body-size);
  font-weight: 600;
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
}
.dv-ghost {
  color: var(--color-text-primary);
  background: transparent;
  border: 1px solid var(--color-divider);
}
.dv-danger {
  color: white;
  background: var(--color-danger);
}
.dv-danger--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
* {
  box-shadow: none !important;
}
</style>