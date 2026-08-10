import { ref, watch, type Ref } from 'vue'

const UI_PREFERENCE_PREFIX = 'finance-manager:ui:'

interface UiPreferenceOptions {
  preferDefault?: boolean
}

export function useUiPreference<T extends string>(
  key: string,
  defaultValue: T,
  allowedValues: readonly T[],
  options: UiPreferenceOptions = {},
): Ref<T> {
  const storageKey = `${UI_PREFERENCE_PREFIX}${key}`
  const value = ref(
    options.preferDefault ? defaultValue : readPreference(storageKey, defaultValue, allowedValues),
  ) as Ref<T>

  watch(
    value,
    (nextValue) => {
      try {
        localStorage.setItem(storageKey, nextValue)
      } catch {
        // Storage can be unavailable in restricted WebViews; in-memory state still works.
      }
    },
    { immediate: true },
  )

  return value
}

function readPreference<T extends string>(
  storageKey: string,
  defaultValue: T,
  allowedValues: readonly T[],
): T {
  try {
    const stored = localStorage.getItem(storageKey)
    return allowedValues.includes(stored as T) ? (stored as T) : defaultValue
  } catch {
    return defaultValue
  }
}
