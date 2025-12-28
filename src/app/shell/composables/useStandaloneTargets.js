import { ref, computed, watch } from 'vue'

/**
 * Manages standalone editor/viewer targets and URL parameter synchronization
 * 
 * Handles reading/writing URL parameters for all standalone modes:
 * - TipTap editor
 * - Plate Editor
 * - Protocol Editor  
 * - Inspector
 * - Explorer
 * - Run Editor
 * - Settings
 * 
 * Also manages bundle selection synchronization for each mode.
 */
export function useStandaloneTargets(schemaLoader) {
  // Target refs
  const tiptapTarget = ref(readTiptapTargetFromUrl())
  const plateEditorTarget = ref(readPlateEditorTargetFromUrl())
  const protocolEditorTarget = ref(readProtocolEditorTargetFromUrl())
  const inspectorTarget = ref(readInspectorTargetFromUrl())
  const explorerTarget = ref(readExplorerTargetFromUrl())
  const runEditorTarget = ref(readRunEditorTargetFromUrl())
  const settingsTarget = ref(readSettingsTargetFromUrl())

  // Computed properties
  const selectedBundleName = computed(() => schemaLoader.selectedBundle.value || '')
  
  const isStandaloneTiptap = computed(() => !!tiptapTarget.value)
  const isStandalonePlateEditor = computed(() => !!plateEditorTarget.value)
  const isStandaloneProtocolEditor = computed(() => !!protocolEditorTarget.value)
  const isStandaloneInspector = computed(() => !!inspectorTarget.value)
  const isStandaloneExplorer = computed(() => !!explorerTarget.value)
  const isStandaloneRunEditor = computed(() => !!runEditorTarget.value)
  const isStandaloneSettings = computed(() => !!settingsTarget.value)

  const tiptapBundleMismatch = computed(() => {
    if (!tiptapTarget.value?.bundle) return false
    return selectedBundleName.value !== tiptapTarget.value.bundle
  })

  const plateEditorBundleMismatch = computed(() => {
    if (!plateEditorTarget.value?.bundle) return false
    return selectedBundleName.value !== plateEditorTarget.value.bundle
  })

  const protocolEditorBundleMismatch = computed(() => {
    if (!protocolEditorTarget.value?.bundle) return false
    return selectedBundleName.value !== protocolEditorTarget.value.bundle
  })

  const explorerBundleMismatch = computed(() => {
    if (!explorerTarget.value?.bundle) return false
    return selectedBundleName.value !== explorerTarget.value.bundle
  })

  const runEditorBundleMismatch = computed(() => {
    if (!runEditorTarget.value?.bundle) return false
    return selectedBundleName.value !== runEditorTarget.value.bundle
  })

  // URL reading functions
  function readTiptapTargetFromUrl() {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (!params.has('tiptapPath')) return null
    return {
      path: decodeURIComponent(params.get('tiptapPath')),
      recordType: params.get('tiptapType') || '',
      bundle: params.get('tiptapBundle') || ''
    }
  }

  function readPlateEditorTargetFromUrl() {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (!params.has('plateEditorPath')) return null
    return {
      path: decodeURIComponent(params.get('plateEditorPath')),
      bundle: params.get('plateEditorBundle') || ''
    }
  }

  function readProtocolEditorTargetFromUrl() {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (!params.has('protocolEditorPath')) return null
    return {
      path: decodeURIComponent(params.get('protocolEditorPath')),
      bundle: params.get('protocolEditorBundle') || ''
    }
  }

  function readInspectorTargetFromUrl() {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (!params.has('inspectorPath')) return null
    return {
      path: decodeURIComponent(params.get('inspectorPath')),
      bundle: params.get('inspectorBundle') || ''
    }
  }

  function readExplorerTargetFromUrl() {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (!params.has('explorerPath')) return null
    return {
      path: decodeURIComponent(params.get('explorerPath')),
      bundle: params.get('explorerBundle') || '',
      labware: params.get('explorerLabware') || ''
    }
  }

  function readRunEditorTargetFromUrl() {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (!params.has('runEditorPath')) return null
    return {
      path: decodeURIComponent(params.get('runEditorPath')),
      bundle: params.get('runEditorBundle') || ''
    }
  }

  function readSettingsTargetFromUrl() {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (params.get('settings') !== 'true') return null
    return { mode: 'settings' }
  }

  // URL clearing functions
  function clearTiptapTarget() {
    tiptapTarget.value = null
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('tiptapPath')
      url.searchParams.delete('tiptapType')
      url.searchParams.delete('tiptapBundle')
      window.history.replaceState({}, '', url.toString())
    }
  }

  function clearPlateEditorTarget() {
    plateEditorTarget.value = null
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('plateEditorPath')
      url.searchParams.delete('plateEditorBundle')
      window.history.replaceState({}, '', url.toString())
    }
  }

  function clearProtocolEditorTarget() {
    protocolEditorTarget.value = null
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('protocolEditorPath')
      url.searchParams.delete('protocolEditorBundle')
      window.history.replaceState({}, '', url.toString())
    }
  }

  function clearExplorerTarget() {
    explorerTarget.value = null
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('explorerPath')
      url.searchParams.delete('explorerBundle')
      url.searchParams.delete('explorerLabware')
      window.history.replaceState({}, '', url.toString())
    }
  }

  function clearRunEditorTarget() {
    runEditorTarget.value = null
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('runEditorPath')
      url.searchParams.delete('runEditorBundle')
      window.history.replaceState({}, '', url.toString())
    }
  }

  function clearSettingsTarget() {
    settingsTarget.value = null
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('settings')
      window.history.replaceState({}, '', url.toString())
    }
  }

  // Watchers for bundle synchronization
  watch(
    () => tiptapTarget.value?.bundle,
    (bundle) => {
      if (bundle && selectedBundleName.value !== bundle && typeof schemaLoader.selectBundle === 'function') {
        schemaLoader.selectBundle(bundle)
      }
    }
  )

  watch(
    () => plateEditorTarget.value?.bundle,
    (bundle) => {
      if (bundle && selectedBundleName.value !== bundle && typeof schemaLoader.selectBundle === 'function') {
        schemaLoader.selectBundle(bundle)
      }
    }
  )

  watch(
    () => protocolEditorTarget.value?.bundle,
    (bundle) => {
      if (bundle && selectedBundleName.value !== bundle && typeof schemaLoader.selectBundle === 'function') {
        schemaLoader.selectBundle(bundle)
      }
    }
  )

  watch(
    () => explorerTarget.value?.bundle,
    (bundle) => {
      if (bundle && selectedBundleName.value !== bundle && typeof schemaLoader.selectBundle === 'function') {
        schemaLoader.selectBundle(bundle)
      }
    }
  )

  watch(
    () => runEditorTarget.value?.bundle,
    (bundle) => {
      if (bundle && selectedBundleName.value !== bundle && typeof schemaLoader.selectBundle === 'function') {
        schemaLoader.selectBundle(bundle)
      }
    }
  )

  return {
    // Target refs
    tiptapTarget,
    plateEditorTarget,
    protocolEditorTarget,
    inspectorTarget,
    explorerTarget,
    runEditorTarget,
    settingsTarget,

    // Computed - standalone mode checks
    isStandaloneTiptap,
    isStandalonePlateEditor,
    isStandaloneProtocolEditor,
    isStandaloneInspector,
    isStandaloneExplorer,
    isStandaloneRunEditor,
    isStandaloneSettings,

    // Computed - bundle mismatches
    tiptapBundleMismatch,
    plateEditorBundleMismatch,
    protocolEditorBundleMismatch,
    explorerBundleMismatch,
    runEditorBundleMismatch,
    selectedBundleName,

    // Clear functions
    clearTiptapTarget,
    clearPlateEditorTarget,
    clearProtocolEditorTarget,
    clearExplorerTarget,
    clearRunEditorTarget,
    clearSettingsTarget
  }
}
