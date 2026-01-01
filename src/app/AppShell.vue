<script setup>
import { computed, ref, watch, reactive, onMounted, onBeforeUnmount } from 'vue'
import TiptapStandalone from './shell/standalone/TiptapStandalone.vue'
import SettingsStandalone from './shell/standalone/SettingsStandalone.vue'
import PlateEditorStandalone from './shell/standalone/PlateEditorStandalone.vue'
import ProtocolEditorStandalone from './shell/standalone/ProtocolEditorStandalone.vue'
import RunEditorStandalone from './shell/standalone/RunEditorStandalone.vue'
import ExplorerStandalone from './shell/standalone/ExplorerStandalone.vue'
import InspectorStandalone from './shell/standalone/InspectorStandalone.vue'
import ShellLayout from './shell/ShellLayout.vue'
import ShellNavBar from './shell/ShellNavBar.vue'
import WorkspaceHost from './shell/WorkspaceHost.vue'
import ShellOverlays from './shell/ShellOverlays.vue'
import { parseFrontMatter, serializeFrontMatter } from '../records/frontMatter'
import { resolveLayoutIndex } from '../plate-editor/utils/layoutResolver'
import { useMaterialLibrary } from '../plate-editor/composables/useMaterialLibrary'
import { buildRecordContextOverrides } from '../records/biologyInheritance'
import { useRepoConnection } from '../fs/repoConnection'
import { useVirtualRepoTree } from '../fs/useVirtualRepoTree'
import { useSchemaBundle } from '../schema-bundles/useSchemaBundle'
import { useRecordGraph } from '../graph/useRecordGraph'
import { useSearchIndex } from '../search/useSearchIndex'
import { useRecordValidator } from '../records/recordValidator'
import { useSystemConfig } from '../config/useSystemConfig'
import { configureOntologyService } from '../ontology/service'
import { useOfflineStatus } from '../composables/useOfflineStatus'
import { buildZodSchema } from '../records/zodBuilder'
import { promoteEvents, mappingFromTarget, resolveRole, buildProtocolFrontmatter } from './promotionUtils'
import { useStandaloneTargets } from './shell/composables/useStandaloneTargets'
import { useExplorerState } from './shell/composables/useExplorerState'
import { useRunEditorState } from './shell/composables/useRunEditorState'
import { usePromotionWorkflow } from './shell/composables/usePromotionWorkflow'
import { useRecordCreation } from './shell/composables/useRecordCreation'
import { useSettingsModal } from './shell/composables/useSettingsModal'
import { assertionFilename } from '../assertions/assertionUtils'
import {
  openTipTapWindow,
  openProtocolEditorWindow,
  openRunEditorWindow,
  openFileInspectorWindow
} from './shell/utils/windowOpeners'
import AssertionModal from '../assertions/AssertionModal.vue'

const repo = useRepoConnection()
const tree = useVirtualRepoTree(repo)
const schemaLoader = useSchemaBundle(repo)
const recordGraph = useRecordGraph(repo, schemaLoader)
const searchIndex = useSearchIndex(recordGraph)
const systemConfig = useSystemConfig(repo)
const offlineStatus = useOfflineStatus()

// Core computed and reactive state (must be defined before composables that use them)
const schemaBundle = computed(() => schemaLoader.schemaBundle?.value)
const recordValidator = useRecordValidator(schemaLoader)
const materialLibrary = useMaterialLibrary(repo)
const isReady = computed(() => !!repo.directoryHandle.value)
const isOnline = computed(() => offlineStatus.isOnline.value)
const fallbackLayout = computed(() => resolveLayoutIndex({}, { fallbackKind: 'plate96' }))
const activeRecordPath = ref('')
const relationshipsConfig = computed(() => schemaBundle.value?.relationships?.recordTypes || {})

// Standalone targets management
const standaloneTargets = useStandaloneTargets(schemaLoader)
const {
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
  tiptapBundleMismatch,
  plateEditorBundleMismatch,
  protocolEditorBundleMismatch,
  explorerBundleMismatch,
  runEditorBundleMismatch,
  selectedBundleName,
  clearTiptapTarget,
  clearPlateEditorTarget,
  clearProtocolEditorTarget,
  clearExplorerTarget,
  clearRunEditorTarget,
  clearSettingsTarget
} = standaloneTargets

// Explorer state management
const explorerStateManager = useExplorerState(
  repo,
  explorerTarget,
  schemaLoader,
  fallbackLayout
)
const {
  explorerState,
  explorerForm,
  explorerFilePath,
  explorerLabwareId,
  showExplorerModal,
  explorerSelectedRun,
  explorerSelectedLabware,
  canAppendExplorerEvent,
  loadExplorerData,
  collectPlateEvents,
  resetExplorerForm,
  appendExplorerEvent,
  handleExplorerOpen
} = explorerStateManager

// Run editor state management
const runEditorStateManager = useRunEditorState(
  repo,
  runEditorTarget,
  recordValidator,
  materialLibrary,
  recordGraph,
  schemaLoader
)
const {
  runEditorState,
  runEditorFilePath,
  showRunEditorModal,
  runEditorSaving,
  runEditorStandaloneRef,
  pendingPaletteAdd,
  runEditorRef,
  loadRunEditorData,
  handleRunEditorSave,
  loadRunById,
  handleRunEditorOpen,
  openRunEditorWith
} = runEditorStateManager

// Promotion workflow management
const promotionWorkflowManager = usePromotionWorkflow(
  repo,
  schemaLoader,
  activeRecordPath,
  explorerState,
  collectPlateEvents
)
const {
  showPromotionModal,
  promotionForm,
  openPromotionModal,
  handlePromoteRun,
  labwareRowsToMap,
  validateProtocolFrontmatter
} = promotionWorkflowManager

// Record creation management
const recordCreationManager = useRecordCreation(
  repo,
  recordGraph,
  searchIndex,
  relationshipsConfig,
  openProtocolEditorWindow,
  openFileInspectorWindow,
  activeRecordPath
)
const {
  showCreator,
  creatorContext,
  openCreator,
  closeCreator,
  buildMetadataPatchFromNode
} = recordCreationManager

// Settings modal management
const settingsManager = useSettingsModal(
  systemConfig,
  isReady,
  isStandaloneSettings,
  clearSettingsTarget
)
const {
  showSettingsModal,
  settingsSaving,
  settingsError,
  settingsForm,
  openSettings,
  closeSettings,
  saveSettings,
  syncSettingsForm
} = settingsManager

const rootNodes = tree.rootNodes
const isTreeBootstrapping = tree.isBootstrapping
const namespacingConfig = computed(() => systemConfig.namespacingConfig?.value || {})

// Additional reactive state
const showPrompt = ref(true)
const showAssertionModal = ref(false)
const assertionInvokedFrom = ref('')
const assertionContext = ref({})
const tiptapStatus = ref('')
const inspectorStatus = ref('')
const shouldShowModal = computed(() => showPrompt.value && !repo.directoryHandle.value && !repo.isRestoring.value)
const connectionLabel = computed(() => repo.statusLabel.value)
const runOptions = computed(() => {
  const nodes = recordGraph.graph?.value?.nodesByType?.run || []
  return nodes.map((node) => ({
    id: node.id || node.frontMatter?.metadata?.id || '',
    label: node.title || node.id || '',
    path: node.path || '',
    labwareIds: Array.isArray(node.frontMatter?.data?.labware_instances)
      ? node.frontMatter.data.labware_instances.map((inst) => inst?.['@id']).filter(Boolean)
      : [],
    labwareId:
      (Array.isArray(node.frontMatter?.data?.labware_instances) &&
        node.frontMatter.data.labware_instances.find((inst) => inst?.['@id'])?.['@id']) ||
      ''
  }))
})
const tiptapSupportedTypes = computed(() => schemaBundle.value?.manifest?.tiptap?.recordTypes || [])
function inferRecordTypeFromPath(path = '') {
  if (!path) return ''
  const namingConfig = schemaBundle.value?.naming || {}
  for (const [recordType, cfg] of Object.entries(namingConfig)) {
    const baseDir = cfg?.baseDir?.replace(/^\/+|\/+$/g, '')
    if (baseDir && path.includes(`${baseDir}/`)) {
      return recordType
    }
  }
  if (path.includes('/studies/')) return 'study'
  if (path.includes('/experiments/')) return 'experiment'
  if (path.includes('/runs/')) return 'run'
  return ''
}
const tiptapRecordType = computed(
  () =>
    tiptapTarget.value?.recordType ||
    tiptapGraphNode.value?.recordType ||
    inferRecordTypeFromPath(tiptapTarget.value?.path)
)
const tiptapSchema = computed(() =>
  tiptapRecordType.value ? schemaBundle.value?.recordSchemas?.[tiptapRecordType.value] || null : null
)
const tiptapUiConfig = computed(() =>
  tiptapRecordType.value ? schemaBundle.value?.uiConfigs?.[tiptapRecordType.value] || null : null
)
const tiptapNamingRule = computed(() =>
  tiptapRecordType.value ? schemaBundle.value?.naming?.[tiptapRecordType.value] || null : null
)
const tiptapSupports = computed(
  () => !!tiptapRecordType.value && tiptapSupportedTypes.value.includes(tiptapRecordType.value)
)
const tiptapGraphNode = computed(() => {
  if (!tiptapTarget.value?.path) return null
  return recordGraph.graph?.value?.nodesByPath?.[tiptapTarget.value.path] || null
})
const tiptapContextOverrides = computed(() => buildRecordContextOverrides(tiptapGraphNode.value))
const featureFlags = computed(() => systemConfig.config.value?.features || {})
const graphTreeEnabled = computed(() => featureFlags.value.graphTree !== false)
const graphQueryEnabled = computed(() => featureFlags.value.graphQueries === true)
const defaultGraphRootType = computed(() => {
  if (schemaBundle.value?.recordSchemas?.study) return 'study'
  const types = Object.keys(schemaBundle.value?.recordSchemas || {})
  return types[0] || ''
})
const defaultGraphRootLabel = computed(() => {
  if (defaultGraphRootType.value === 'study') return 'Studies'
  if (!defaultGraphRootType.value) return 'Records'
  return `${defaultGraphRootType.value.charAt(0).toUpperCase()}${defaultGraphRootType.value.slice(1)} records`
})
const supportingDocumentEnabled = computed(() => !!schemaBundle.value?.recordSchemas?.['supporting-document'])
const protocolEnabled = computed(() => !!schemaBundle.value?.recordSchemas?.protocol)

watch(
  [() => repo.directoryHandle.value, () => schemaLoader.schemaBundle?.value, () => systemConfig.ontologyConfig.value],
  ([handle, bundle, ontologyCfg]) => {
    configureOntologyService({
      repoConnection: handle ? repo : null,
      systemConfig: ontologyCfg,
      vocabSchemas: bundle?.vocabSchemas || {}
    })
  },
  { immediate: true }
)

watch(
  [() => explorerTarget.value?.path, () => repo.directoryHandle.value],
  () => {
    loadExplorerData()
  },
  { immediate: true }
)

function resolveLabwareFromEvents(events = []) {
  for (const evt of events) {
    if (Array.isArray(evt?.labware) && evt.labware.length) {
      const entry = evt.labware.find((l) => l?.['@id']) || evt.labware[0]
      if (entry?.['@id']) return entry['@id']
    }
    if (evt?.details?.target?.labware?.['@id']) return evt.details.target.labware['@id']
  }
  return ''
}

function resolveLabwareFromActivities(activities = []) {
  for (const act of activities) {
    if (Array.isArray(act?.plate_events)) {
      const id = resolveLabwareFromEvents(act.plate_events)
      if (id) return id
    }
  }
  return ''
}

function resolveLabwareFromNode(node) {
  if (!node) return ''
  const data =
    node.frontMatter?.data ||
    node.data ||
    node.frontMatter ||
    node.metadata ||
    node.run ||
    {}
  const instances = data.labware_instances || []
  if (Array.isArray(instances) && instances.length) {
    const entry = instances.find((l) => l?.id || l?.['@id']) || instances[0]
    return entry?.id || entry?.['@id'] || ''
  }
  return ''
}

watch(
  () => repo.directoryHandle.value,
  (handle) => {
    if (handle) {
      showPrompt.value = false
    }
  }
)

watch(
  () => offlineStatus.isOnline.value,
  (online) => {
    if (online) {
      searchIndex?.rebuild?.()
    }
  }
)

async function handleConnect() {
  if (repo.isRequesting.value) {
    return
  }
  if (!repo.isSupported) {
    repo.error.value = 'File System Access API not available in this browser.'
    return
  }

  let pickerPromise
  try {
    pickerPromise = window.showDirectoryPicker()
  } catch (err) {
    if (err?.name !== 'AbortError') {
      repo.error.value = err?.message || 'Unable to open directory picker.'
    }
    return
  }

  await repo.requestAccess(pickerPromise)
}

function reopenPrompt() {
  showPrompt.value = true
}

function closePrompt() {
  showPrompt.value = false
}

function handleSelect(nodeOrPath) {
  // Handle both string paths and node objects
  const node = typeof nodeOrPath === 'object' && nodeOrPath !== null ? nodeOrPath : null
  const path = node ? node.path : typeof nodeOrPath === 'string' ? nodeOrPath : ''
  if (path) {
    activeRecordPath.value = path
  }
}

async function handleRecordCreated(payload) {
  const { path, recordType } = normalizeCreationResult(payload)
  showCreator.value = false
  creatorContext.value = null

  if (recordGraph?.rebuild) {
    await recordGraph.rebuild()
  }
  if (searchIndex?.rebuild) {
    searchIndex.rebuild()
  }
  if (path) {
    activeRecordPath.value = path
  }
}

function normalizeCreationResult(payload) {
  if (!payload) {
    return { path: '', recordType: '', metadata: {} }
  }
  if (typeof payload === 'string') {
    return { path: payload, recordType: '', metadata: {} }
  }
  return {
    path: payload.path || '',
    recordType: payload.recordType || '',
    metadata: payload.metadata || {}
  }
}

async function handleExpand(node) {
  await tree.loadChildrenForNode(node)
}

function handleStandaloneSaved() {
  tiptapStatus.value = 'TapTab changes saved.'
  recordGraph?.rebuild?.()
  searchIndex?.rebuild?.()
}

function handleInspectorSaved() {
  inspectorStatus.value = 'Inspector changes saved.'
  recordGraph?.rebuild?.()
  searchIndex?.rebuild?.()
}

watch(
  () => showExplorerModal.value,
  (open) => {
    if (open && !explorerFilePath.value && activeRecordPath.value) {
      explorerFilePath.value = activeRecordPath.value
    }
  }
)

watch(
  () => showRunEditorModal.value,
  (open) => {
    if (open && !runEditorFilePath.value && activeRecordPath.value) {
      runEditorFilePath.value = activeRecordPath.value
    }
  }
)

function handleUseRunAsSource(payload = {}) {
  const runId = payload.runId || explorerSelectedRun.value || ''
  if (!runId) return
  const labwareId =
    payload.labwareId ||
    explorerSelectedLabware.value ||
    explorerTarget.value?.labware ||
    resolveLabwareFromEvents(explorerState.events) ||
    ''
  const runNode = runOptions.value.find((node) => node.id === runId)
  const path = payload.path || runNode?.path || explorerTarget.value?.path || ''
  const label = payload.label || labwareId || runId
  const bundle = payload.bundle || explorerTarget.value?.bundle || schemaLoader.selectedBundle?.value

  // If requested, open the run editor in a new tab regardless of existing editor state.
  if (payload.openInNewTab && path) {
    openRunEditorWindow(path, bundle)
    return
  }

  pendingPaletteAdd.value = { runId, labwareId, label }
  // If run editor already loaded, add immediately
  if (runEditorRef.value?.store) {
    runEditorRef.value.store.addRunDerivedPaletteEntry({
      runId,
      labwareId,
      label,
      layoutIndex: resolveLayoutIndex({}, { fallbackKind: 'plate96' })
    })
    pendingPaletteAdd.value = null
    return
  }
  // Otherwise open the run editor on the run (new tab if requested)
  if (path) {
    openRunEditorWith(path, bundle)
  }
}

function handleGraphCreate(payload) {
  if (!payload?.recordType) return
  const metadataPatch = {}
  if (payload.parentField && payload.parentId) {
    metadataPatch[payload.parentField] = payload.parentId
  }
  openCreator({
    recordType: payload.recordType,
    metadata: metadataPatch,
    parentLink: payload.parentField && payload.parentId
      ? {
          field: payload.parentField,
          id: payload.parentId,
          node: payload.parentNode || null
        }
      : null
  })
}

function openSupportingDocumentFromGraph(targetNode) {
  if (!supportingDocumentEnabled.value) return
  const node = targetNode?.node || targetNode
  if (!node?.id) return
  const metadataPatch = {
    ...buildMetadataPatchFromNode(node),
    supportingDocumentOf: node.id
  }
  openCreator({
    recordType: 'supporting-document',
    metadata: metadataPatch
  })
}

function handleGraphOpenTipTap(payload) {
  if (!payload?.path || !payload?.recordType) return
  const bundle = schemaLoader.selectedBundle?.value
  openTipTapWindow(payload.path, payload.recordType, bundle)
}

function handleGraphOpenProtocol(payload) {
  if (!payload) return
  const path = payload.path || payload.node?.path || ''
  if (!path) return
  const bundle = schemaLoader.selectedBundle?.value
  openProtocolEditorWindow(path, bundle)
}

function handleGraphSupportingDoc(payload) {
  if (!payload?.node) return
  openSupportingDocumentFromGraph(payload.node)
}

function handleGraphUseAsSource(node) {
  if (!node) return
  
  // If openInNewTab flag is set, open in a new tab
  if (node.openInNewTab && node.path) {
    const bundle = node.bundle || schemaLoader.selectedBundle?.value
    openRunEditorWindow(node.path, bundle)
    return
  }
  
  const runId = node.id || node.frontMatter?.metadata?.id || node.frontMatter?.metadata?.recordId || ''
  const labwareId = resolveLabwareFromNode(node) || 'plate/UNKNOWN'
  const label = node.title || labwareId || runId
  const bundle = node.bundle || schemaLoader.selectedBundle?.value
  pendingPaletteAdd.value = { runId, labwareId, label }
  if (runEditorRef.value?.store) {
    runEditorRef.value.store.addRunDerivedPaletteEntry({
      runId,
      labwareId,
      label,
      layoutIndex: resolveLayoutIndex({}, { fallbackKind: 'plate96' })
    })
    pendingPaletteAdd.value = null
    return
  }
  if (node.path) {
    openRunEditorWith(node.path, bundle)
  }
}

function handleCreateProtocol() {
  if (!isReady.value || !protocolEnabled.value) return
  openCreator({
    recordType: 'protocol',
    simpleMode: true
  })
}

function handleCreateStudy() {
  if (!isReady.value) return
  openCreator({
    recordType: 'study',
    simpleMode: true
  })
}

function inferContextFromActivePath() {
  const path = activeRecordPath.value || ''
  if (!path) return { invokedFrom: 'global_assertions_browser', context: {} }
  const normalized = path.toLowerCase()
  if (normalized.includes('/runs/')) {
    return { invokedFrom: 'run_editor', context: { path } }
  }
  if (normalized.includes('/experiments/')) {
    return { invokedFrom: 'experiment_editor', context: { path } }
  }
  if (normalized.includes('/studies/')) {
    return { invokedFrom: 'project_editor', context: { path } }
  }
  return { invokedFrom: 'global_assertions_browser', context: {} }
}

async function buildAssertionContextFromPath(path) {
  if (!path) return null
  try {
    const raw = await repo.readFile(path)
    const { data } = parseFrontMatter(raw)
    const recordId = data?.['@id'] || data?.id || data?.recordId || data?.record_id || data?.identifier || ''
    const recordType = data?.recordType || data?.kind || ''
    const scope = {}
    if (recordType === 'run') scope.run = recordId
    if (recordType === 'experiment') scope.experiment = recordId
    if (recordType === 'study') scope.study = recordId
    return { path, recordId, recordType, scope }
  } catch (err) {
    console.warn('[Assertion] Failed to build context from path', path, err)
    return { path }
  }
}

async function handleOpenAssertion(invokedFrom = 'global_assertions_browser', context = {}) {
  const inferred = inferContextFromActivePath()
  let resolvedContext = Object.keys(context || {}).length ? { ...context } : { ...inferred.context }
  if (resolvedContext.path) {
    const enriched = await buildAssertionContextFromPath(resolvedContext.path)
    if (enriched?.scope) {
      resolvedContext = { ...resolvedContext, ...enriched.scope, recordId: enriched.recordId, recordType: enriched.recordType }
      if (!invokedFrom || invokedFrom === 'global_assertions_browser') {
        if (enriched.recordType === 'run') invokedFrom = 'run_editor'
        else if (enriched.recordType === 'experiment') invokedFrom = 'experiment_editor'
        else if (enriched.recordType === 'study') invokedFrom = 'project_editor'
      }
    }
  }
  assertionInvokedFrom.value = invokedFrom || inferred.invokedFrom
  assertionContext.value = resolvedContext
  showAssertionModal.value = true
}

function handleCloseAssertion() {
  showAssertionModal.value = false
}

function handleQuickAddAssertion() {
  handleOpenAssertion('quick_add_command_palette', {})
}

async function handleSaveAssertion(payload) {
  if (!payload?.ok) {
    console.warn('[AssertionModal] Save failed', payload?.error)
    return
  }
  const { assertion, storage } = payload
  try {
    const embedRecommended = storage?.embedRecommended
    const hasPath = assertionContext.value?.path || activeRecordPath.value
    const preferEmbed = embedRecommended && hasPath
    const mode = preferEmbed ? 'embedded' : storage?.mode || 'embedded'

    if (mode === 'standalone_record') {
      if (embedRecommended && !hasPath) {
        console.warn('[AssertionModal] Standalone blocked due to well/run scope; no embedding context available.')
        return
      }
      const targetPath = `/${assertionFilename(assertion['@id'])}`
      const content = serializeFrontMatter(assertion, '')
      await repo.writeFile(targetPath, content)
    } else if (hasPath) {
      const targetPath = assertionContext.value?.path || activeRecordPath.value
      const raw = await repo.readFile(targetPath)
      const { data, body } = parseFrontMatter(raw)
      const nextData = { ...(data || {}) }
      const list = Array.isArray(nextData.assertions) ? nextData.assertions.slice() : []
      list.push(assertion)
      nextData.assertions = list
      const content = serializeFrontMatter(nextData, body || '')
      await repo.writeFile(targetPath, content)
    } else {
      console.warn('[AssertionModal] No target context for embedding; assertion not saved.')
      return
    }
    showAssertionModal.value = false
    recordGraph?.rebuild?.()
    searchIndex?.rebuild?.()
  } catch (err) {
    console.error('[AssertionModal] Failed to save assertion', err)
  }
}

// Quick-add command palette shortcut (Ctrl/Cmd + Shift + A)
function handleKeydown(event) {
  const isMac = /Mac|iPod|iPhone|iPad/.test(window.navigator?.platform || '')
  const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey
  if (cmdOrCtrl && event.shiftKey && event.key?.toLowerCase() === 'a') {
    event.preventDefault()
    handleQuickAddAssertion()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <InspectorStandalone
    v-if="isStandaloneInspector"
    :is-online="isOnline"
    :is-ready="isReady"
    :repo="repo"
    :inspector-target="inspectorTarget"
    :schema-loader="schemaLoader"
    :record-graph="recordGraph"
    @connect="handleConnect"
    @saved="handleInspectorSaved"
  />
  <SettingsStandalone
    v-else-if="isStandaloneSettings"
    :is-online="isOnline"
    :repo-is-requesting="repo.isRequesting.value"
    :settings-form="settingsForm"
    :settings-saving="settingsSaving"
    :settings-error="settingsError"
    @connect="handleConnect"
    @clear="clearSettingsTarget"
    @save="saveSettings"
  />
  <div v-else-if="isStandaloneTiptap" class="tiptap-standalone">
    <TiptapStandalone
      :is-online="isOnline"
      :is-ready="isReady"
      :repo="repo"
      :tiptap-target="tiptapTarget"
      :tiptap-status="tiptapStatus"
      :tiptap-bundle-mismatch="tiptapBundleMismatch"
      :tiptap-supports="tiptapSupports"
      :tiptap-schema="tiptapSchema"
      :tiptap-ui-config="tiptapUiConfig"
      :tiptap-naming-rule="tiptapNamingRule"
      :schema-bundle="schemaLoader.schemaBundle?.value || {}"
      :validate-record="recordValidator.validate"
      :tiptap-context-overrides="tiptapContextOverrides.value || {}"
      @connect="handleConnect"
      @clear="clearTiptapTarget"
      @saved="handleStandaloneSaved"
    />
  </div>
  <PlateEditorStandalone
    v-else-if="isStandalonePlateEditor"
    :is-online="isOnline"
    :is-ready="isReady"
    :repo="repo"
    :schema-loader="schemaLoader"
    :plate-editor-target="plateEditorTarget"
    :plate-editor-bundle-mismatch="plateEditorBundleMismatch"
    @connect="handleConnect"
    @clear="clearPlateEditorTarget"
  />
  <ProtocolEditorStandalone
    v-else-if="isStandaloneProtocolEditor"
    :is-online="isOnline"
    :is-ready="isReady"
    :repo="repo"
    :schema-loader="schemaLoader"
    :protocol-editor-target="protocolEditorTarget"
    :protocol-editor-bundle-mismatch="protocolEditorBundleMismatch"
    @connect="handleConnect"
    @clear="clearProtocolEditorTarget"
  />
  <RunEditorStandalone
    v-else-if="isStandaloneRunEditor"
    ref="runEditorStandaloneRef"
    :is-online="isOnline"
    :is-ready="isReady"
    :repo-is-requesting="repo.isRequesting.value"
    :run-editor-target="runEditorTarget"
    :run-editor-bundle-mismatch="runEditorBundleMismatch"
    :run-editor-state="runEditorState"
    :run-options="runOptions"
    :validate-record="recordValidator.validate"
    :load-run-by-id="loadRunById"
    :run-editor-saving="runEditorSaving"
    @connect="handleConnect"
    @clear="clearRunEditorTarget"
    @save="handleRunEditorSave"
  />
  <ExplorerStandalone
    v-else-if="isStandaloneExplorer"
    :is-online="isOnline"
    :is-ready="isReady"
    :repo-is-requesting="repo.isRequesting.value"
    :explorer-target="explorerTarget"
    :explorer-bundle-mismatch="explorerBundleMismatch"
    :explorer-state="explorerState"
    :explorer-form="explorerForm"
    :can-append-explorer-event="canAppendExplorerEvent"
    :fallback-layout="fallbackLayout"
    @connect="handleConnect"
    @clear="clearExplorerTarget"
    @use-as-source="handleUseRunAsSource"
    @reset-form="resetExplorerForm"
    @append-event="appendExplorerEvent"
  />
  <ShellLayout v-else :show-offline="!isOnline">
    <template #header>
      <ShellNavBar
        kicker="Phase 2 · File I/O Layer"
        title="DIsCo Pages 2.0"
        subtitle="Schema-driven LIS/QMS shell powered by Vue + Vite"
        :connection-label="connectionLabel"
        :is-ready="isReady"
        :is-requesting="repo.isRequesting.value"
        :is-supported="repo.isSupported"
        @open-settings="openSettings"
        @connect="handleConnect"
      />
    </template>
    <template #status>
      <p v-if="repo.error" class="status status-error header-status">{{ repo.error }}</p>
      <p v-else-if="repo.isRestoring" class="status status-muted header-status">Restoring previous session…</p>
      <p v-else-if="!repo.isSupported" class="status status-error header-status">
        This browser does not expose the File System Access API.
      </p>
    </template>
    <template #offline>
      <p class="offline-banner">
        Offline mode: editing uses cached schemas and search results. Reconnect to sync with the repo.
      </p>
    </template>

    <WorkspaceHost
      :graph-tree-enabled="graphTreeEnabled"
      :graph-query-enabled="graphQueryEnabled"
      :is-ready="isReady"
      :protocol-enabled="protocolEnabled"
      :record-graph="recordGraph"
      :schema-loader="schemaLoader"
      :default-graph-root-type="defaultGraphRootType"
      :default-graph-root-label="defaultGraphRootLabel"
      :active-record-path="activeRecordPath"
      :tiptap-supported-types="tiptapSupportedTypes"
      :supporting-document-enabled="supportingDocumentEnabled"
      :root-nodes="rootNodes"
      :is-tree-bootstrapping="isTreeBootstrapping"
      :search-index="searchIndex"
      @select="handleSelect"
      @expand="handleExpand"
      @create-study="handleCreateStudy"
      @create-protocol="handleCreateProtocol"
      @open-assertion="handleOpenAssertion('global_assertions_browser', {})"
      @graph-create="handleGraphCreate"
      @graph-open-tiptap="handleGraphOpenTipTap"
      @graph-open-protocol="handleGraphOpenProtocol"
      @graph-create-supporting-doc="handleGraphSupportingDoc"
      @graph-use-as-source="handleGraphUseAsSource"
    />

    <ShellOverlays
      :should-show-modal="shouldShowModal"
      :repo="repo"
      :show-settings-modal="showSettingsModal"
      :settings-form="settingsForm"
      :settings-error="settingsError"
      :settings-saving="settingsSaving"
      :show-promotion-modal="showPromotionModal"
      :promotion-form="promotionForm"
      :show-explorer-modal="showExplorerModal"
      :explorer-file-path="explorerFilePath"
      :explorer-labware-id="explorerLabwareId"
      :show-run-editor-modal="showRunEditorModal"
      :run-editor-file-path="runEditorFilePath"
      :show-creator="showCreator"
      :creator-context="creatorContext"
      :show-assertion-modal="showAssertionModal"
      :assertion-invoked-from="assertionInvokedFrom"
      :assertion-context="assertionContext"
      :namespacing-config="namespacingConfig"
      :schema-loader="schemaLoader"
      :record-graph="recordGraph"
      @connect="handleConnect"
      @close-prompt="closePrompt"
      @close-settings="closeSettings"
      @save-settings="saveSettings"
      @close-promotion="() => (showPromotionModal = false)"
      @promote-run="handlePromoteRun"
      @close-explorer="() => (showExplorerModal = false)"
      @open-explorer="handleExplorerOpen"
      @update:explorer-file-path="(val) => (explorerFilePath = val)"
      @update:explorer-labware-id="(val) => (explorerLabwareId = val)"
      @close-run-editor="() => (showRunEditorModal = false)"
      @open-run-editor="handleRunEditorOpen"
      @update:run-editor-file-path="(val) => (runEditorFilePath = val)"
      @close-creator="closeCreator"
      @record-created="handleRecordCreated"
      @close-assertion="handleCloseAssertion"
      @save-assertion="handleSaveAssertion"
    />
  </ShellLayout>
</template>

<style scoped>
.header-status {
  margin-top: -1rem;
}

.offline-banner {
  margin: 0;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(202, 138, 4, 0.4);
  background: #fefce8;
  color: #713f12;
  font-size: 0.9rem;
}

.ghost-button {
  border: 1px solid #cbd5f5;
  background: #fff;
  color: #0f172a;
  padding: 0.25rem 0.8rem;
  border-radius: 999px;
  font-size: 0.85rem;
  cursor: pointer;
}

.ghost-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

code {
  background: #e2e8f0;
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
}

.explorer-form {
  margin-top: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.explorer-form__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.labware-rows {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.labware-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.4rem;
  align-items: center;
}

.labware-row .tiny {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}
</style>
