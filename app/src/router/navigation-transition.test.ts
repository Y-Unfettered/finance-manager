import {
  commitNavigationEntry,
  initializeNavigationEntry,
  navigationCacheEpoch,
  navigationEntryId,
  prepareNavigationEntry,
  resetNavigationStateCache,
} from './navigation-transition'

describe('navigation entry state', () => {
  it('reuses an entry for history traversal and creates one for a new push', () => {
    window.history.replaceState({ __financeManagerEntryId: 'existing-entry' }, '')
    initializeNavigationEntry()
    expect(navigationEntryId.value).toBe('existing-entry')

    prepareNavigationEntry(false)
    commitNavigationEntry()
    const pushedEntry = navigationEntryId.value
    expect(pushedEntry).not.toBe('existing-entry')
    expect(window.history.state.__financeManagerEntryId).toBe(pushedEntry)

    window.history.replaceState({ __financeManagerEntryId: 'existing-entry' }, '')
    prepareNavigationEntry(true)
    commitNavigationEntry()
    expect(navigationEntryId.value).toBe('existing-entry')
  })

  it('invalidates cached entries after switching ledgers', () => {
    const previousEpoch = navigationCacheEpoch.value
    resetNavigationStateCache()
    expect(navigationCacheEpoch.value).toBe(previousEpoch + 1)
  })
})
