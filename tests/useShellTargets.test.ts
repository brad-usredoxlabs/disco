import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useShellTargets } from '../src/app/shell/composables/useShellTargets'

describe('useShellTargets', () => {
  let historyReplace: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const url = new URL(
      'https://example.test/?tiptapPath=notes%2Falpha.md&tiptapType=protocol&tiptapBundle=lab&settings=true'
    )
    historyReplace = vi.fn()
    vi.stubGlobal('window', {
      location: {
        href: url.toString(),
        search: url.search
      },
      history: {
        replaceState: historyReplace
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses initial targets and exposes standalone flags', () => {
    const targets = useShellTargets()
    expect(targets.isStandaloneTiptap.value).toBe(true)
    expect(targets.tiptapTarget.value?.path).toBe('notes/alpha.md')
    expect(targets.tiptapTarget.value?.recordType).toBe('protocol')
    expect(targets.tiptapTarget.value?.bundle).toBe('lab')
    expect(targets.isStandaloneSettings.value).toBe(true)
    expect(targets.settingsTarget.value?.mode).toBe('settings')
  })

  it('clears URL params when clearing targets', () => {
    const targets = useShellTargets()
    targets.clearTiptapTarget()
    expect(targets.tiptapTarget.value).toBeNull()
    const replacedUrl = historyReplace.mock.calls[0]?.[2] || ''
    expect(replacedUrl).not.toContain('tiptapPath')
    expect(replacedUrl).toContain('settings=true')
  })

  it('selects bundle when target bundle differs', async () => {
    const selectBundle = vi.fn()
    const selectedBundleName = ref('other-bundle')
    useShellTargets({ schemaLoader: { selectBundle }, selectedBundleName })
    await nextTick()
    expect(selectBundle).toHaveBeenCalledWith('lab')
  })
})
