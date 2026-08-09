<script setup lang="ts">
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Plus,
  RotateCcw,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppBottomSheet from '@/components/AppBottomSheet.vue'
import AppTopBar from '@/components/AppTopBar.vue'
import BaseCard from '@/components/BaseCard.vue'
import CategoryIcon from '@/components/CategoryIcon.vue'
import { useUiPreference } from '@/composables/useUiPreference'
import type { CategoryDetailRecord } from '@/domain/entities'
import { CATEGORY_ICON_OPTIONS, type CategoryIconSeries } from '@/features/finance/category-icons'
import { useFinanceService } from '@/features/finance/finance-service'
import { useAppStore } from '@/stores/app'
import { prepareCustomIconDataUri } from '@/utils/icon-image'

const router = useRouter()
const appStore = useAppStore()
const finance = useFinanceService()
const kind = useUiPreference<'expense' | 'income'>('category-management:kind', 'expense', [
  'expense',
  'income',
])
const categories = ref<CategoryDetailRecord[]>([])
const expanded = ref(new Set<string>())
const showEditor = ref(false)
const saving = ref(false)
const preparingIcon = ref(false)
const error = ref('')
const showArchived = ref(false)
const iconQuery = ref('')
const iconSeries = ref<CategoryIconSeries>('outline')
const customIconInput = ref<HTMLInputElement>()
const form = ref({
  categoryId: '',
  parentId: '',
  name: '',
  iconKey: 'utensils',
  color: '#5b8def',
})

const roots = computed(() =>
  categories.value.filter(
    (item) =>
      item.kind === kind.value && !item.parentId && (showArchived.value || !item.archivedAt),
  ),
)
const activeRoots = computed(() =>
  categories.value.filter((item) => item.kind === kind.value && !item.parentId && !item.archivedAt),
)
const busy = computed(() => saving.value || preparingIcon.value)
const hasCustomIcon = computed(() =>
  /^data:image\/(?:png|jpeg|webp);base64,/i.test(form.value.iconKey),
)
const filteredIcons = computed(() => {
  const query = iconQuery.value.trim().toLowerCase()
  return CATEGORY_ICON_OPTIONS.filter(
    (icon) =>
      icon.series === iconSeries.value &&
      (!query || `${icon.key} ${icon.label} ${icon.keywords}`.toLowerCase().includes(query)),
  )
})

async function load(): Promise<void> {
  if (finance && appStore.ledgerId)
    categories.value = await finance.listCategories(appStore.ledgerId)
}

function children(id: string): CategoryDetailRecord[] {
  return categories.value.filter(
    (item) => item.parentId === id && (showArchived.value || !item.archivedAt),
  )
}

function openCreate(parentId = ''): void {
  form.value = {
    categoryId: '',
    parentId,
    name: '',
    iconKey: 'circle-ellipsis',
    color: '#5b8def',
  }
  iconQuery.value = ''
  iconSeries.value = 'outline'
  preparingIcon.value = false
  error.value = ''
  showEditor.value = true
}

function openEdit(item: CategoryDetailRecord): void {
  form.value = {
    categoryId: item.id,
    parentId: item.parentId ?? '',
    name: item.name,
    iconKey: item.iconKey ?? 'circle-ellipsis',
    color: item.color ?? '#5b8def',
  }
  iconQuery.value = ''
  iconSeries.value = form.value.iconKey.startsWith('filled:') ? 'filled' : 'outline'
  preparingIcon.value = false
  error.value = ''
  showEditor.value = true
}

async function save(): Promise<void> {
  if (!finance || !appStore.ledgerId || busy.value) return
  saving.value = true
  error.value = ''
  try {
    await finance.saveCategory({
      ledgerId: appStore.ledgerId,
      categoryId: form.value.categoryId || undefined,
      parentId: form.value.parentId || undefined,
      kind: kind.value,
      name: form.value.name,
      iconKey: form.value.iconKey,
      color: form.value.color,
    })
    showEditor.value = false
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

function selectCustomIcon(): void {
  if (!busy.value) customIconInput.value?.click()
}

async function uploadCustomIcon(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  error.value = ''
  preparingIcon.value = true
  try {
    form.value.iconKey = await prepareCustomIconDataUri(file)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    preparingIcon.value = false
  }
}

async function setArchived(item: CategoryDetailRecord, archived: boolean): Promise<void> {
  if (!finance || !appStore.ledgerId) return
  if (archived && !confirm(`停用分类“${item.name}”？历史交易仍会保留。`)) return
  if (archived) await finance.archiveCategory(appStore.ledgerId, item.id)
  else await finance.unarchiveCategory(appStore.ledgerId, item.id)
  await load()
}

async function move(item: CategoryDetailRecord, direction: -1 | 1): Promise<void> {
  if (!finance || !appStore.ledgerId) return
  const siblings = categories.value
    .filter(
      (candidate) =>
        candidate.kind === item.kind &&
        (candidate.parentId ?? '') === (item.parentId ?? '') &&
        !candidate.archivedAt,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder)
  const index = siblings.findIndex((candidate) => candidate.id === item.id)
  const target = siblings[index + direction]
  if (!target) return
  await Promise.all([
    finance.saveCategory({
      ledgerId: appStore.ledgerId,
      categoryId: item.id,
      kind: item.kind,
      parentId: item.parentId,
      name: item.name,
      iconKey: item.iconKey,
      color: item.color,
      sortOrder: target.sortOrder,
    }),
    finance.saveCategory({
      ledgerId: appStore.ledgerId,
      categoryId: target.id,
      kind: target.kind,
      parentId: target.parentId,
      name: target.name,
      iconKey: target.iconKey,
      color: target.color,
      sortOrder: item.sortOrder,
    }),
  ])
  await load()
}

function toggle(id: string): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

onMounted(load)
</script>

<template>
  <main class="category-page">
    <div class="safe-top">
      <AppTopBar title="分类管理" @back="router.back()">
        <template #right>
          <button class="add-top" type="button" aria-label="新增一级分类" @click="openCreate()">
            <Plus :size="22" />
          </button>
        </template>
      </AppTopBar>
    </div>
    <div class="content">
      <div class="tabs">
        <button :class="{ active: kind === 'expense' }" @click="kind = 'expense'">支出</button>
        <button :class="{ active: kind === 'income' }" @click="kind = 'income'">收入</button>
      </div>
      <div class="management-head">
        <p>一级分类用于预算，二级分类会自动向上归集。</p>
        <label><input v-model="showArchived" type="checkbox" />显示已停用</label>
      </div>
      <BaseCard
        v-for="root in roots"
        :key="root.id"
        class="category-card"
        :class="{ 'category-card--archived': root.archivedAt }"
      >
        <div class="category-row">
          <CategoryIcon
            :icon-key="root.iconKey"
            :color="root.color"
            :label="root.name"
            :size="40"
          />
          <button class="category-main" type="button" @click="openEdit(root)">
            <strong>{{ root.name }}</strong>
            <small>{{
              root.archivedAt ? '已停用' : `${children(root.id).length} 个二级分类`
            }}</small>
          </button>
          <button type="button" class="mini-button" aria-label="上移" @click="move(root, -1)">
            <ArrowUp :size="16" />
          </button>
          <button type="button" class="mini-button" aria-label="下移" @click="move(root, 1)">
            <ArrowDown :size="16" />
          </button>
          <button type="button" class="icon-button" aria-label="展开" @click="toggle(root.id)">
            <ChevronDown v-if="expanded.has(root.id)" :size="19" />
            <ChevronRight v-else :size="19" />
          </button>
          <button
            type="button"
            class="icon-button"
            :aria-label="root.archivedAt ? '启用' : '停用'"
            @click="setArchived(root, !root.archivedAt)"
          >
            <RotateCcw v-if="root.archivedAt" :size="18" />
            <Archive v-else :size="18" />
          </button>
        </div>
        <div v-if="expanded.has(root.id)" class="children">
          <div v-for="child in children(root.id)" :key="child.id" class="child-row">
            <CategoryIcon
              :icon-key="child.iconKey ?? root.iconKey"
              :color="child.color ?? root.color"
              :label="child.name"
              :size="32"
            />
            <button type="button" @click="openEdit(child)">
              <span>{{ child.name }}</span
              ><small v-if="child.archivedAt">已停用</small>
            </button>
            <button type="button" class="mini-button" aria-label="上移" @click="move(child, -1)">
              <ArrowUp :size="15" />
            </button>
            <button type="button" class="mini-button" aria-label="下移" @click="move(child, 1)">
              <ArrowDown :size="15" />
            </button>
            <button
              type="button"
              class="mini-button"
              :aria-label="child.archivedAt ? '启用' : '停用'"
              @click="setArchived(child, !child.archivedAt)"
            >
              <RotateCcw v-if="child.archivedAt" :size="15" />
              <Archive v-else :size="15" />
            </button>
          </div>
          <button type="button" class="add-child" @click="openCreate(root.id)">
            <Plus :size="17" />添加二级分类
          </button>
        </div>
      </BaseCard>
      <div v-if="!roots.length" class="empty">还没有分类，点击右上角添加</div>
    </div>
    <AppBottomSheet
      v-model:show="showEditor"
      :title="form.categoryId ? '编辑分类' : form.parentId ? '新增二级分类' : '新增一级分类'"
    >
      <form class="editor" @submit.prevent="save">
        <label><span>分类名称</span><input v-model="form.name" required maxlength="12" /></label>
        <label>
          <span>上级分类</span>
          <select v-model="form.parentId">
            <option value="">无（一级分类）</option>
            <option
              v-for="root in activeRoots.filter((item) => item.id !== form.categoryId)"
              :key="root.id"
              :value="root.id"
            >
              {{ root.name }}
            </option>
          </select>
        </label>
        <div class="custom-icon-upload">
          <button
            type="button"
            class="custom-upload-choice"
            :class="{ active: hasCustomIcon }"
            :disabled="busy"
            @click="selectCustomIcon"
          >
            <ImagePlus :size="20" aria-hidden="true" />
            <span>
              <strong>{{ hasCustomIcon ? '更换自定义图标' : '上传自定义图标' }}</strong>
              <small>支持 PNG、JPG、WebP，自动缩放为正方形</small>
            </span>
            <CategoryIcon
              v-if="hasCustomIcon"
              :icon-key="form.iconKey"
              :color="form.color"
              :label="form.name || '自定义分类图标'"
              :size="36"
            />
            <ChevronRight v-else :size="19" aria-hidden="true" />
          </button>
          <input
            ref="customIconInput"
            class="custom-upload-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            @change="uploadCustomIcon"
          />
          <small v-if="hasCustomIcon" class="custom-upload-status">
            已选择自定义图标；点击下方图标库可换回内置图标。
          </small>
        </div>
        <div class="icon-series" aria-label="图标系列">
          <button
            type="button"
            :disabled="busy"
            :class="{ active: iconSeries === 'outline' }"
            @click="iconSeries = 'outline'"
          >
            线性
          </button>
          <button
            type="button"
            :disabled="busy"
            :class="{ active: iconSeries === 'filled' }"
            @click="iconSeries = 'filled'"
          >
            面性
          </button>
        </div>
        <label
          ><span>图标搜索</span
          ><input
            v-model="iconQuery"
            type="search"
            :disabled="busy"
            placeholder="搜索餐饮、交通、购物…"
        /></label>
        <div class="icon-picker">
          <button
            v-for="icon in filteredIcons"
            :key="icon.key"
            type="button"
            :disabled="busy"
            :class="{ active: form.iconKey === icon.key }"
            :aria-label="icon.label"
            @click="form.iconKey = icon.key"
          >
            <CategoryIcon :icon-key="icon.key" :color="form.color" :size="36" />
            <small>{{ icon.label }}</small>
          </button>
        </div>
        <label><span>颜色</span><input v-model="form.color" type="color" /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="save-button" type="submit" :disabled="busy">
          {{ preparingIcon ? '处理图片…' : saving ? '保存中…' : '保存' }}
        </button>
      </form>
    </AppBottomSheet>
  </main>
</template>

<style scoped>
.category-page {
  min-height: 100dvh;
  background: var(--color-background);
}
.safe-top {
  padding-top: env(safe-area-inset-top);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}
.add-top,
.icon-button,
.mini-button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
}
.mini-button {
  width: 28px;
  height: 36px;
}
.content {
  display: grid;
  max-width: 520px;
  padding: var(--space-3) var(--page-gutter) calc(var(--space-8) + env(safe-area-inset-bottom));
  margin: auto;
  gap: var(--space-3);
}
.tabs {
  display: grid;
  padding: 3px;
  grid-template-columns: 1fr 1fr;
  background: var(--color-surface);
  border-radius: var(--radius-pill);
}
.tabs button {
  height: 38px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
}
.tabs .active {
  color: white;
  background: var(--color-primary-600);
}
.management-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.management-head p {
  margin: 0;
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.management-head label {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}
.category-card {
  padding: 0 var(--space-3);
}
.category-card--archived {
  opacity: 0.62;
}
.category-row {
  display: grid;
  min-height: 68px;
  grid-template-columns: 44px 1fr 28px 28px 36px 36px;
  align-items: center;
  gap: 2px;
}
.category-main {
  display: grid;
  align-content: center;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}
.category-main small,
.child-row small {
  color: var(--color-text-tertiary);
}
.children {
  padding: 0 0 var(--space-3) 44px;
  border-top: 1px solid var(--color-divider);
}
.child-row {
  display: grid;
  min-height: 48px;
  grid-template-columns: 36px 1fr 28px 28px 28px;
  align-items: center;
  gap: 2px;
  border-bottom: 1px solid var(--color-divider);
}
.child-row > button:nth-child(2) {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  color: inherit;
  background: transparent;
  border: 0;
}
.children .add-child {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-primary-600);
  background: transparent;
  border: 0;
}
.empty {
  padding: var(--space-8);
  color: var(--color-text-tertiary);
  text-align: center;
}
.editor {
  display: grid;
  max-height: calc(100dvh - 112px - env(safe-area-inset-bottom));
  padding: 1px;
  overflow-y: auto;
  gap: var(--space-4);
  overscroll-behavior: contain;
}
.editor label {
  display: grid;
  gap: var(--space-2);
}
.editor label > span {
  color: var(--color-text-secondary);
  font-size: var(--type-caption-size);
}
.editor input,
.editor select {
  height: 46px;
  padding: 0 var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-background);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-control);
}
.editor input[type='color'] {
  padding: 6px;
}
.custom-icon-upload {
  display: grid;
  gap: var(--space-2);
}
.custom-upload-choice {
  display: grid;
  min-height: 62px;
  padding: var(--space-2) var(--space-3);
  grid-template-columns: 24px 1fr 38px;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-primary-700);
  text-align: left;
  background: var(--color-primary-50);
  border: 1px solid var(--color-primary-100);
  border-radius: var(--radius-control);
}
.custom-upload-choice.active {
  border-color: var(--color-primary-500);
}
.custom-upload-choice > span {
  display: grid;
  gap: 2px;
}
.custom-upload-choice small,
.custom-upload-status {
  color: var(--color-text-tertiary);
  font-size: var(--type-caption-size);
}
.custom-upload-choice > svg:last-child {
  color: var(--color-text-tertiary);
}
.custom-upload-input {
  display: none;
}
.custom-upload-status {
  padding: 0 var(--space-1);
}
.icon-series {
  display: grid;
  padding: 3px;
  grid-template-columns: 1fr 1fr;
  background: var(--color-background);
  border-radius: var(--radius-pill);
}
.icon-series button {
  height: 36px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
}
.icon-series button.active {
  color: white;
  background: var(--color-primary-600);
}
.icon-picker {
  display: grid;
  max-height: 246px;
  overflow-y: auto;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-2);
}
.icon-picker button {
  display: grid;
  min-width: 0;
  padding: 4px 2px 5px;
  place-items: center;
  gap: 2px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 2px solid transparent;
  border-radius: var(--radius-control);
}
.icon-picker button.active {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
}
.icon-picker small {
  overflow: hidden;
  width: 100%;
  color: var(--color-text-tertiary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.save-button {
  height: 48px;
  color: white;
  background: var(--color-primary-600);
  border: 0;
  border-radius: var(--radius-control);
}
.error {
  margin: 0;
  color: var(--color-danger);
}
</style>
