import { computed, ref, watch } from 'vue'
import {
  type ExplorerTarget,
  type InspectorTarget,
  type PlateEditorTarget,
  type ProtocolEditorTarget,
  type RunEditorTarget,
  type SettingsTarget,
  type TiptapTarget
} from '../types'
import { clearTargetFromUrl } from '../utils/targets'

type BundleSelector = {
  selectBundle?: (bundle: string) => void
}

type BundleNameRef = {
  value: string
}

interface UseShellTargetsOptions {
  schemaLoader?: BundleSelector
  selectedBundleName?: BundleNameRef
}

const hasWindow = typeof window !== 'undefined'

function readTiptapTargetFromUrl(): TiptapTarget | null {
  if (!hasWindow) return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has('tiptapPath')) return null
  return {
    path: decodeURIComponent(params.get('tiptapPath') || ''),
    recordType: params.get('tiptapType') || '',
    bundle: params.get('tiptapBundle') || ''
  }
}

function readPlateEditorTargetFromUrl(): PlateEditorTarget | null {
  if (!hasWindow) return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has('plateEditorPath')) return null
  return {
    path: decodeURIComponent(params.get('plateEditorPath') || ''),
    bundle: params.get('plateEditorBundle') || ''
  }
}

function readProtocolEditorTargetFromUrl(): ProtocolEditorTarget | null {
  if (!hasWindow) return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has('protocolEditorPath')) return null
  return {
    path: decodeURIComponent(params.get('protocolEditorPath') || ''),
    bundle: params.get('protocolEditorBundle') || ''
  }
}

function readInspectorTargetFromUrl(): InspectorTarget | null {
  if (!hasWindow) return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has('inspectorPath')) return null
  return {
    path: decodeURIComponent(params.get('inspectorPath') || ''),
    bundle: params.get('inspectorBundle') || ''
  }
}

function readExplorerTargetFromUrl(): ExplorerTarget | null {
  if (!hasWindow) return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has('explorerPath')) return null
  return {
    path: decodeURIComponent(params.get('explorerPath') || ''),
    bundle: params.get('explorerBundle') || '',
    labware: params.get('explorerLabware') || ''
  }
}

function readRunEditorTargetFromUrl(): RunEditorTarget | null {
  if (!hasWindow) return null
  const params = new URLSearchParams(window.location.search)
  if (!params.has('runEditorPath')) return null
  return {
    path: decodeURIComponent(params.get('runEditorPath') || ''),
    bundle: params.get('runEditorBundle') || ''
  }
}

function readSettingsTargetFromUrl(): SettingsTarget | null {
  if (!hasWindow) return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('settings') !== 'true') return null
  return { mode: 'settings' }
}

export function useShellTargets(options: UseShellTargetsOptions = {}) {
  const tiptapTarget = ref<TiptapTarget | null>(readTiptapTargetFromUrl())
  const plateEditorTarget = ref<PlateEditorTarget | null>(readPlateEditorTargetFromUrl())
  const protocolEditorTarget = ref<ProtocolEditorTarget | null>(readProtocolEditorTargetFromUrl())
  const inspectorTarget = ref<InspectorTarget | null>(readInspectorTargetFromUrl())
  const explorerTarget = ref<ExplorerTarget | null>(readExplorerTargetFromUrl())
  const runEditorTarget = ref<RunEditorTarget | null>(readRunEditorTargetFromUrl())
  const settingsTarget = ref<SettingsTarget | null>(readSettingsTargetFromUrl())

  const isStandaloneTiptap = computed(() => !!tiptapTarget.value)
  const isStandalonePlateEditor = computed(() => !!plateEditorTarget.value)
  const isStandaloneProtocolEditor = computed(() => !!protocolEditorTarget.value)
  const isStandaloneInspector = computed(() => !!inspectorTarget.value)
  const isStandaloneExplorer = computed(() => !!explorerTarget.value)
  const isStandaloneRunEditor = computed(() => !!runEditorTarget.value)
  const isStandaloneSettings = computed(() => !!settingsTarget.value)

  const selectBundleIfNeeded = (bundle?: string | null) => {
    if (!bundle) return
    const current = options.selectedBundleName?.value || ''
    if (current === bundle) return
    options.schemaLoader?.selectBundle?.(bundle)
  }

  watch(
    () => tiptapTarget.value?.bundle,
    (bundle) => selectBundleIfNeeded(bundle),
    { immediate: true }
  )
  watch(
    () => plateEditorTarget.value?.bundle,
    (bundle) => selectBundleIfNeeded(bundle),
    { immediate: true }
  )
  watch(
    () => protocolEditorTarget.value?.bundle,
    (bundle) => selectBundleIfNeeded(bundle),
    { immediate: true }
  )
  watch(
    () => inspectorTarget.value?.bundle,
    (bundle) => selectBundleIfNeeded(bundle),
    { immediate: true }
  )
  watch(
    () => explorerTarget.value?.bundle,
    (bundle) => selectBundleIfNeeded(bundle),
    { immediate: true }
  )
  watch(
    () => runEditorTarget.value?.bundle,
    (bundle) => selectBundleIfNeeded(bundle),
    { immediate: true }
  )

  function clearTiptapTarget() {
    tiptapTarget.value = null
    clearTargetFromUrl(['tiptapPath', 'tiptapType', 'tiptapBundle'])
  }

  function clearPlateEditorTarget() {
    plateEditorTarget.value = null
    clearTargetFromUrl(['plateEditorPath', 'plateEditorBundle'])
  }

  function clearProtocolEditorTarget() {
    protocolEditorTarget.value = null
    clearTargetFromUrl(['protocolEditorPath', 'protocolEditorBundle'])
  }

  function clearExplorerTarget() {
    explorerTarget.value = null
    clearTargetFromUrl(['explorerPath', 'explorerBundle', 'explorerLabware'])
  }

  function clearRunEditorTarget() {
    runEditorTarget.value = null
    clearTargetFromUrl(['runEditorPath', 'runEditorBundle'])
  }

  function clearSettingsTarget() {
    settingsTarget.value = null
    clearTargetFromUrl(['settings'])
  }

  return {
    tiptapTarget,
    plateEditorTarget,
    protocolEditorTarget,
    inspectorTarget,
    explorerTarget,
    runEditorTarget,
    settingsTarget,
    isStandaloneTiptap,
    isStandalonePlateEditor,
    isStandaloneProtocolEditor,
    isStandaloneInspector,
    isStandaloneExplorer,
    isStandaloneRunEditor,
    isStandaloneSettings,
    clearTiptapTarget,
    clearPlateEditorTarget,
    clearProtocolEditorTarget,
    clearExplorerTarget,
    clearRunEditorTarget,
    clearSettingsTarget
  }
}
