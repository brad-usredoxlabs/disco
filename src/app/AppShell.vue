<script setup>
import { computed, ref, watch, reactive } from 'vue'
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
import { resolveLayoutIndex } from '../plate-editor/utils/layoutResolver'
import { useMaterialLibrary } from '../plate-editor/composables/useMaterialLibrary'
import { buildRecordContextOverrides } from '../records/biologyInheritance'
import { useRepoConnection } from '../fs/repoConnection'
import { useVirtualRepoTree } from '../fs/useVirtualRepoTree'
import { useSchemaBundle } from '../schema-bundles/useSchemaBundle'
import { useWorkflowBundle } from '../workflows/useWorkflowBundle'
import { useRecordGraph } from '../graph/useRecordGraph'
import { useSearchIndex } from '../search/useSearchIndex'
import { useRecordValidator } from '../records/recordValidator'
import { useSystemConfig } from '../config/useSystemConfig'
import { configureOntologyService } from '../ontology/service'
import { useOfflineStatus } from '../composables/useOfflineStatus'
import { parseFrontMatter, serializeFrontMatter } from '../records/frontMatter'
import { buildZodSchema } from '../records/zodBuilder'
import { promoteEvents, mappingFromTarget, resolveRole, buildProtocolFrontmatter } from './promotionUtils'

const repo = useRepoConnection()
const tree = useVirtualRepoTree(repo)
const schemaLoader = useSchemaBundle(repo)
const workflowLoader = useWorkflowBundle(repo, schemaLoader)
const recordGraph = useRecordGraph(repo, schemaLoader)
const searchIndex = useSearchIndex(recordGraph)
const systemConfig = useSystemConfig(repo)
const offlineStatus = useOfflineStatus()
const showCreator = ref(false)
const creatorContext = ref(null)
const rootNodes = tree.rootNodes
const isTreeBootstrapping = tree.isBootstrapping

const showPrompt = ref(true)
const schemaBundle = computed(() => schemaLoader.schemaBundle?.value)
const recordValidator = useRecordValidator(schemaLoader)
const materialLibrary = useMaterialLibrary(repo)
const tiptapTarget = ref(readTiptapTargetFromUrl())
const plateEditorTarget = ref(readPlateEditorTargetFromUrl())
const protocolEditorTarget = ref(readProtocolEditorTargetFromUrl())
const inspectorTarget = ref(readInspectorTargetFromUrl())
const tiptapStatus = ref('')
const inspectorStatus = ref('')
const explorerTarget = ref(readExplorerTargetFromUrl())
const explorerSelectedRun = ref(null)
const explorerSelectedLabware = ref('')
const pendingPaletteAdd = ref(null)
const runEditorTarget = ref(readRunEditorTargetFromUrl())
const settingsTarget = ref(readSettingsTargetFromUrl())
const runEditorStandaloneRef = ref(null)
const runEditorRef = computed(() => runEditorStandaloneRef.value?.runEditorRef?.value || null)
const showSettingsModal = ref(false)
const settingsSaving = ref(false)
const settingsError = ref('')
const settingsForm = reactive({
  cacheDuration: 30,
  localNamespace: ''
})
const runEditorState = reactive({
  run: null,
  body: '',
  layout: null,
  materialLibrary: [],
  status: '',
  error: ''
})
const runEditorSaving = ref(false)
const explorerState = reactive({
  events: [],
  labwareId: '',
  layoutIndex: null,
  status: '',
  error: '',
  activities: [],
  runFrontmatter: null,
  runBody: ''
})
const shouldShowModal = computed(() => showPrompt.value && !repo.directoryHandle.value && !repo.isRestoring.value)
const connectionLabel = computed(() => repo.statusLabel.value)
const isReady = computed(() => !!repo.directoryHandle.value)
const isStandaloneTiptap = computed(() => !!tiptapTarget.value)
const isStandalonePlateEditor = computed(() => !!plateEditorTarget.value)
const isStandaloneProtocolEditor = computed(() => !!protocolEditorTarget.value)
const isStandaloneInspector = computed(() => !!inspectorTarget.value)
const isStandaloneExplorer = computed(() => !!explorerTarget.value)
const isStandaloneRunEditor = computed(() => !!runEditorTarget.value)
const isOnline = computed(() => offlineStatus.isOnline.value)
const fallbackLayout = computed(() => resolveLayoutIndex({}, { fallbackKind: 'plate96' }))
const selectedBundleName = computed(() => schemaLoader.selectedBundle.value || '')
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
const tiptapSchema = computed(() =>
  tiptapTarget.value ? schemaBundle.value?.recordSchemas?.[tiptapTarget.value.recordType] || null : null
)
const tiptapUiConfig = computed(() =>
  tiptapTarget.value ? schemaBundle.value?.uiConfigs?.[tiptapTarget.value.recordType] || null : null
)
const tiptapNamingRule = computed(() =>
  tiptapTarget.value ? schemaBundle.value?.naming?.[tiptapTarget.value.recordType] || null : null
)
const tiptapSupports = computed(() =>
  !!tiptapTarget.value && tiptapSupportedTypes.value.includes(tiptapTarget.value.recordType)
)
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
const isStandaloneSettings = computed(() => !!settingsTarget.value)
const tiptapWorkflowDefinition = computed(() =>
  tiptapTarget.value ? workflowLoader.getMachine(tiptapTarget.value.recordType) : null
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
  if (schemaBundle.value?.recordSchemas?.project) return 'project'
  const types = Object.keys(schemaBundle.value?.recordSchemas || {})
  return types[0] || ''
})
const defaultGraphRootLabel = computed(() => {
  if (defaultGraphRootType.value === 'project') return 'Projects'
  if (!defaultGraphRootType.value) return 'Records'
  return `${defaultGraphRootType.value.charAt(0).toUpperCase()}${defaultGraphRootType.value.slice(1)} records`
})
const activeRecordPath = ref('')
const relationshipsConfig = computed(() => schemaBundle.value?.relationships?.recordTypes || {})
const supportingDocumentEnabled = computed(() => !!schemaBundle.value?.recordSchemas?.['supporting-document'])
const topLevelRecordTypes = computed(() => {
  const relations = relationshipsConfig.value || {}
  const list = Object.entries(relations)
    .filter(([, descriptor]) => {
      const parents = descriptor?.parents || {}
      return !Object.keys(parents).length
    })
    .map(([type]) => type)
    .sort((a, b) => a.localeCompare(b))
  if (list.length) return list
  return defaultGraphRootType.value ? [defaultGraphRootType.value] : []
})
const selectedRootRecordType = ref('')
const protocolEnabled = computed(() => !!schemaBundle.value?.recordSchemas?.protocol)

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

watch(
  [() => runEditorTarget.value?.path, () => repo.directoryHandle.value],
  () => {
    loadRunEditorData()
  },
  { immediate: true }
)

watch(
  () => materialLibrary.entries.value,
  (entries) => {
    runEditorState.materialLibrary = Array.isArray(entries) ? entries : []
  },
  { immediate: true }
)

watch(
  () => topLevelRecordTypes.value,
  (list) => {
    if (!list.length) {
      selectedRootRecordType.value = ''
      return
    }
    if (!list.includes(selectedRootRecordType.value)) {
      selectedRootRecordType.value = list[0]
    }
  },
  { immediate: true }
)

watch(
  () => systemConfig.config.value,
  () => {
    syncSettingsForm()
  },
  { immediate: true }
)

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

async function loadExplorerData() {
  if (!explorerTarget.value || !repo.directoryHandle.value || repo.isRestoring.value) return
  if (!explorerTarget.value.path) return
  explorerState.status = 'Loading…'
  explorerState.error = ''
  try {
    const raw = await repo.readFile(explorerTarget.value.path)
    const { data, body } = parseFrontMatter(raw)
    const events = await collectPlateEvents(data)
    explorerState.events = events
    explorerState.activities = Array.isArray(data.activities) ? data.activities : data.operations?.activities || []
    explorerState.runFrontmatter = data
    explorerState.runBody = body || ''
    explorerState.labwareId =
      explorerTarget.value.labware ||
      resolveLabwareFromEvents(events) ||
      resolveLabwareFromActivities(explorerState.activities) ||
      'plate/UNKNOWN'
    explorerSelectedRun.value = data?.metadata?.recordId || data?.metadata?.id || ''
    explorerSelectedLabware.value = explorerState.labwareId
    explorerState.layoutIndex = fallbackLayout.value
    explorerState.status = events.length ? '' : 'No PlateEvents found in run.'
  } catch (err) {
    explorerState.error = err?.message || 'Failed to load run for explorer.'
    explorerState.events = []
    explorerState.activities = []
  }
}

async function loadRunEditorData() {
  if (!runEditorTarget.value || !repo.directoryHandle.value || repo.isRestoring.value) return
  if (!runEditorTarget.value.path) return
  runEditorState.status = 'Loading…'
  runEditorState.error = ''
  try {
    const raw = await repo.readFile(runEditorTarget.value.path)
    const { data, body } = parseFrontMatter(raw)
    runEditorState.run = data || null
    runEditorState.body = body || ''
    runEditorState.layout = null
    runEditorState.materialLibrary = Array.isArray(materialLibrary.entries.value)
      ? materialLibrary.entries.value
      : []
    runEditorState.status = ''
    // Apply pending palette addition if present
    if (pendingPaletteAdd.value && runEditorRef.value?.store) {
      const { runId, labwareId, label } = pendingPaletteAdd.value
      runEditorRef.value.store.addRunDerivedPaletteEntry({
        runId,
        labwareId,
        label: label || labwareId,
        layoutIndex: resolveLayoutIndex({}, { fallbackKind: 'plate96' })
      })
      pendingPaletteAdd.value = null
    }
  } catch (error) {
    runEditorState.error = error?.message || 'Failed to load run.'
    runEditorState.status = ''
    console.error('Error loading run editor data', error)
  }
}

async function handleRunEditorSave() {
  if (!runEditorTarget.value?.path || !repo.directoryHandle.value) return
  if (!runEditorRef.value?.store?.state?.run) return
  runEditorSaving.value = true
  runEditorState.status = 'Saving…'
  runEditorState.error = ''
  try {
    const store = runEditorRef.value.store
    const updated = store.state.run
    if (typeof store.derivePaletteData === 'function') {
      store.derivePaletteData()
    }
    if (typeof store.sanitizeTransfers === 'function') {
      store.sanitizeTransfers()
    }
    const validationPayload = store.buildValidationPayload
      ? store.buildValidationPayload()
      : (typeof runEditorRef.value?.buildRunValidationPayload === 'function'
          ? runEditorRef.value.buildRunValidationPayload(updated)
          : null) || updated
    const validation = recordValidator.validate('run', validationPayload)
    if (!validation.ok) {
      runEditorState.error = `Run validation failed: ${validation.issues.map((i) => i.message).join('; ')}`
      runEditorState.status = ''
      return
    }
    const text = serializeFrontMatter(updated, runEditorState.body || '')
    await repo.writeFile(runEditorTarget.value.path, text)
    runEditorState.status = 'Saved.'
  } catch (error) {
    runEditorState.error = error?.message || 'Failed to save run.'
    runEditorState.status = ''
    console.error('Run editor save error', error)
  } finally {
    runEditorSaving.value = false
  }
}

async function loadRunById(runId = '') {
  if (!runId || !repo?.readFile) return null
  const node =
    recordGraph.graph?.value?.nodesById?.[runId] ||
    recordGraph.graph?.value?.nodesById?.[runId.replace(/^run\//, '')] ||
    null
  if (!node?.path) return null
  try {
    const raw = await repo.readFile(node.path)
    const { data } = parseFrontMatter(raw)
    return data || null
  } catch (err) {
    console.warn('Failed to load run by id', runId, err)
    return null
  }
}

async function collectPlateEvents(data = {}) {
  const events = []
  const activities = data.activities || data.operations?.activities || []
  activities.forEach((act) => {
    if (Array.isArray(act?.plate_events)) {
      events.push(...act.plate_events)
    }
  })
  if (!events.length && Array.isArray(data.operations?.events)) {
    events.push(...data.operations.events)
  }
  if (!events.length) {
    const layoutPath = data.operations?.plateLayout || (Array.isArray(data.operations?.plateLayouts) && data.operations.plateLayouts[0])
    if (layoutPath && repo?.readFile) {
      try {
        const rawLayout = await repo.readFile(layoutPath)
        const { data: layoutData } = parseFrontMatter(rawLayout)
        const layoutEvents = layoutData?.operations?.events || []
        events.push(...layoutEvents)
        explorerState.status = 'Loaded events from plate layout.'
      } catch (err) {
        console.warn('Failed to read plate layout for events', err)
      }
    }
  }
  return events
}

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

function openSettings() {
  settingsError.value = ''
  settingsSaving.value = false
  syncSettingsForm()
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.set('settings', 'true')
    window.location.href = url.toString()
    return
  }
  showSettingsModal.value = true
}

function closeSettings() {
  if (isStandaloneSettings.value) {
    clearSettingsTarget()
  }
  showSettingsModal.value = false
}

async function saveSettings() {
  if (!isReady.value) {
    settingsError.value = 'Connect a repository to save settings.'
    return
  }
  settingsSaving.value = true
  settingsError.value = ''
  try {
    await systemConfig.save({
      ontology: {
        cache_duration: Number(settingsForm.cacheDuration) || 30
      },
      provenance: {
        local_namespace: settingsForm.localNamespace || ''
      }
    })
    if (isStandaloneSettings.value) {
      clearSettingsTarget()
    }
    showSettingsModal.value = false
  } catch (err) {
    settingsError.value = err?.message || 'Failed to save settings.'
  } finally {
    settingsSaving.value = false
  }
}

function syncSettingsForm() {
  const ontologyCfg = systemConfig.ontologyConfig.value
  settingsForm.cacheDuration = ontologyCfg.cacheDuration || 30
  settingsForm.localNamespace = systemConfig.provenanceConfig?.value?.localNamespace || ''
}

function openCreator(options = null) {
  creatorContext.value = options || null
  showCreator.value = true
}

function closeCreator() {
  showCreator.value = false
  creatorContext.value = null
}

function handleSelect(nodeOrPath) {
  // Handle both string paths and node objects
  const node = typeof nodeOrPath === 'object' && nodeOrPath !== null ? nodeOrPath : null
  const path = node ? node.path : typeof nodeOrPath === 'string' ? nodeOrPath : ''
  if (node?.recordType === 'plateLayout' && path) {
    openPlateEditorWindow(path)
    return
  }
  if (node?.recordType === 'protocol' && path) {
    openProtocolEditorWindow(path)
    return
  }
  if (node?.recordType === 'run' && path) {
    openRunEditorWindow(path)
    return
  }
  if (path) {
    openFileInspectorWindow(path)
    activeRecordPath.value = path
  }
}

function openFileInspectorWindow(path) {
  if (!path) return
  if (typeof window === 'undefined') return
  const baseUrl = new URL(window.location.href)
  baseUrl.searchParams.delete('inspectorPath')
  const rootUrl = baseUrl.toString().split('?')[0]
  const targetUrl = new URL(rootUrl, window.location.href)
  targetUrl.searchParams.set('inspectorPath', path)
  const bundle = schemaLoader.selectedBundle?.value
  if (bundle) {
    targetUrl.searchParams.set('inspectorBundle', bundle)
  }
  window.open(targetUrl.toString(), '_blank', 'noopener,noreferrer')
}

async function handleRecordCreated(payload) {
  const creationContext = creatorContext.value
  const { path, recordType, metadata } = normalizeCreationResult(payload)
  showCreator.value = false
  creatorContext.value = null
  let handled = false
  if (recordType === 'plateLayout') {
    if (creationContext?.parentLink?.node?.recordType === 'run') {
      await linkPlateLayoutToRun(creationContext.parentLink.node, metadata, path)
    }
    if (path) {
      openPlateEditorWindow(path)
      handled = true
    }
  }
  if (recordType === 'protocol' && path) {
    openProtocolEditorWindow(path)
    handled = true
  }
  if (!handled && path) {
    openFileInspectorWindow(path)
    activeRecordPath.value = path
  }
  recordGraph?.rebuild?.()
  searchIndex?.rebuild?.()
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

async function linkPlateLayoutToRun(parentNode, childMetadata = {}, childPath = '') {
  const runPath = parentNode?.path
  const identifier = derivePlateLayoutIdentifier(childMetadata, childPath)
  if (!runPath || !identifier) return
  try {
    const raw = await repo.readFile(runPath)
    const { data: frontMatter = {}, body } = parseFrontMatter(raw)
    const metadataSection = frontMatter.metadata || {}
    const dataSection = frontMatter.data || {}
    const operations = { ...(dataSection.operations || {}) }
    const plateLayouts = Array.isArray(operations.plateLayouts) ? [...operations.plateLayouts] : []
    if (plateLayouts.includes(identifier)) {
      return
    }
    plateLayouts.push(identifier)
    const nextFrontMatter = {
      ...frontMatter,
      metadata: metadataSection,
      data: {
        ...dataSection,
        operations: {
          ...operations,
          plateLayouts
        }
      }
    }
    const serialized = serializeFrontMatter(nextFrontMatter, body)
    await repo.writeFile(runPath, serialized)
  } catch (err) {
    console.warn('[PlateLayouts] Unable to link run with plate layout', err)
  }
}

function derivePlateLayoutIdentifier(childMetadata = {}, childPath = '') {
  if (childMetadata.recordId) return childMetadata.recordId
  if (childMetadata.id) return childMetadata.id
  return inferRecordIdFromPath(childPath)
}

function inferRecordIdFromPath(path = '') {
  if (!path) return ''
  const fileName = path.split('/').filter(Boolean).pop() || ''
  if (!fileName) return ''
  const base = fileName.replace(/\.md$/i, '')
  return base.split('_')[0] || base
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

const explorerFilePath = ref('')
const explorerLabwareId = ref('')
const showExplorerModal = ref(false)
const runEditorFilePath = ref('')
const showRunEditorModal = ref(false)
const explorerForm = reactive({
  activityId: '',
  sourceWell: '',
  targetWell: '',
  volume: '',
  materialId: '',
  status: '',
  error: ''
})
const showPromotionModal = ref(false)
const promotionForm = reactive({
  runPath: '',
  family: '',
  version: '0.1.0',
  title: 'Promoted protocol',
  volumeParam: '',
  labwareRows: [
    { role: 'source_role', id: 'labware:res1' },
    { role: 'target_role', id: 'plate/PLT-0001' }
  ],
  status: '',
  error: ''
})
const canAppendExplorerEvent = computed(() => {
  return (
    explorerForm.activityId &&
    explorerForm.sourceWell.trim() &&
    explorerForm.targetWell.trim() &&
    explorerForm.volume.trim() &&
    explorerTarget.value?.path
  )
})

async function handleExplorerOpen() {
  if (!explorerFilePath.value) return
  const bundle = schemaLoader.selectedBundle?.value
  const url = new URL(window.location.href)
  url.searchParams.delete('explorerPath')
  url.searchParams.delete('explorerBundle')
  url.searchParams.delete('explorerLabware')
  url.searchParams.set('explorerPath', explorerFilePath.value)
  if (bundle) url.searchParams.set('explorerBundle', bundle)
  if (explorerLabwareId.value) url.searchParams.set('explorerLabware', explorerLabwareId.value)
  explorerTarget.value = {
    path: explorerFilePath.value,
    bundle,
    labware: explorerLabwareId.value
  }
  window.history.replaceState({}, '', url.toString())
  loadExplorerData()
  showExplorerModal.value = false
}

async function handleRunEditorOpen() {
  if (!runEditorFilePath.value) return
  const bundle = schemaLoader.selectedBundle?.value
  openRunEditorWith(runEditorFilePath.value, bundle)
  showRunEditorModal.value = false
}

function openRunEditorWith(path, bundle) {
  if (!path) return
  const url = new URL(window.location.href)
  url.searchParams.delete('runEditorPath')
  url.searchParams.delete('runEditorBundle')
  url.searchParams.set('runEditorPath', path)
  if (bundle) url.searchParams.set('runEditorBundle', bundle)
  runEditorTarget.value = {
    path,
    bundle
  }
  window.history.replaceState({}, '', url.toString())
  loadRunEditorData()
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

function resetExplorerForm() {
  explorerForm.activityId = ''
  explorerForm.sourceWell = ''
  explorerForm.targetWell = ''
  explorerForm.volume = ''
  explorerForm.materialId = ''
  explorerForm.status = ''
  explorerForm.error = ''
}

async function appendExplorerEvent() {
  if (!canAppendExplorerEvent.value || !explorerState.runFrontmatter || !explorerTarget.value?.path) return
  explorerForm.status = 'Saving…'
  explorerForm.error = ''
  try {
    const fm = JSON.parse(JSON.stringify(explorerState.runFrontmatter || {}))
    const data = fm.data || {}
    const activities = Array.isArray(data.activities) ? data.activities : data.operations?.activities || []
    const idx = activities.findIndex((a) => a.id === explorerForm.activityId)
    if (idx === -1) throw new Error('Activity not found on run.')
    activities[idx].plate_events ||= []
    const event = buildQuickTransferEvent(explorerForm, fm)
    activities[idx].plate_events.push(event)
    data.activities = activities
    fm.data = data
    const serialized = serializeFrontMatter(fm, explorerState.runBody || '')
    await repo.writeFile(explorerTarget.value.path, serialized)
    explorerForm.status = 'Event appended.'
    await loadExplorerData()
  } catch (err) {
    explorerForm.error = err?.message || 'Failed to append event.'
  }
  explorerForm.saving = false
}

function buildQuickTransferEvent(form, fm = {}) {
  const runId = fm.metadata?.id || fm.metadata?.recordId || fm.metadata?.runId || ''
  const labwareId = explorerState.labwareId || 'plate/UNKNOWN'
  const timestamp = new Date().toISOString()
  return {
    id: `evt-${Date.now()}`,
    event_type: 'transfer',
    timestamp,
    run: runId,
    labware: [{ '@id': labwareId, kind: 'plate' }],
    details: {
      type: 'transfer',
      source: {
        labware: { '@id': labwareId, kind: 'plate' },
        wells: {
          [form.sourceWell.trim()]: {}
        }
      },
      target: {
        labware: { '@id': labwareId, kind: 'plate' },
        wells: {
          [form.targetWell.trim()]: {
            well: form.targetWell.trim(),
            material_id: form.materialId?.trim() || ''
          }
        }
      },
      mapping: [
        {
          source_well: form.sourceWell.trim(),
          target_well: form.targetWell.trim(),
          volume: form.volume.trim()
        }
      ],
      volume: form.volume.trim(),
    material: form.materialId?.trim() ? { id: form.materialId.trim() } : null
    }
  }
}

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
  // Otherwise open the run editor on the run
  if (path) {
    const bundle = payload.bundle || explorerTarget.value?.bundle || schemaLoader.selectedBundle?.value
    openRunEditorWith(path, bundle)
  }
}

function openPromotionModal() {
  promotionForm.runPath = activeRecordPath.value || ''
  promotionForm.status = ''
  promotionForm.error = ''
  if (!promotionForm.labwareRows.length) {
    promotionForm.labwareRows = [{ role: 'source_role', id: '' }]
  }
  prefillLabwareRowsFromRun()
  showPromotionModal.value = true
}

function prefillLabwareRowsFromRun() {
  if (!explorerState.activities?.length) return
  const idToKind = new Map()
  explorerState.activities.forEach((act) => {
    ;(act.plate_events || []).forEach((evt) => {
      if (Array.isArray(evt.labware)) {
        evt.labware.forEach((lw) => lw?.['@id'] && idToKind.set(lw['@id'], lw.kind || ''))
      }
      if (evt.details?.source?.labware?.['@id']) {
        idToKind.set(evt.details.source.labware['@id'], evt.details.source.labware.kind || '')
      }
      if (evt.details?.target?.labware?.['@id']) {
        idToKind.set(evt.details.target.labware['@id'], evt.details.target.labware.kind || '')
      }
    })
  })
  const existingIds = new Set(promotionForm.labwareRows.map((row) => row.id))
  const usedRoles = new Set(promotionForm.labwareRows.map((row) => row.role).filter(Boolean))
  idToKind.forEach((kind, id) => {
    if (existingIds.has(id)) return
    const suggestedRole = suggestRoleForLabware(id, kind, usedRoles)
    usedRoles.add(suggestedRole)
    promotionForm.labwareRows.push({ role: suggestedRole, id })
  })
}

function suggestRoleForLabware(id, kind = '', usedRoles = new Set()) {
  const lower = String(id || '').toLowerCase()
  let base = 'labware'
  if (kind === 'reservoir' || lower.includes('res')) base = 'reservoir'
  else if (kind === 'plate' || lower.includes('qpcr')) base = 'qpcr_plate'
  else if (lower.includes('plate')) base = 'plate'
  else if (lower.includes('tube')) base = 'tube_rack'
  let role = base
  let counter = 1
  while (usedRoles.has(role)) {
    role = `${base}_${counter}`
    counter += 1
  }
  return role
}

async function handlePromoteRun() {
  if (!promotionForm.runPath) {
    promotionForm.error = 'Select a run path.'
    return
  }
  promotionForm.status = 'Promoting…'
  promotionForm.error = ''
  try {
    const raw = await repo.readFile(promotionForm.runPath)
    const { data } = parseFrontMatter(raw)
    const events = await collectPlateEvents(data)
    if (!events.length) {
      throw new Error('No PlateEvents found in run.')
    }
    const mapping = labwareRowsToMap(promotionForm.labwareRows)
    const promotedEvents = promoteEvents(events, mapping, promotionForm.volumeParam)
    const frontmatter = buildProtocolFrontmatter(
      data,
      promotedEvents,
      promotionForm.family,
      promotionForm.version,
      promotionForm.title,
      mapping
    )
    const validation = validateProtocolFrontmatter(frontmatter)
    if (!validation.ok) {
      throw new Error(validation.issues.map((i) => `${i.path}: ${i.message}`).join(' | '))
    }
    const outPath =
      promotionForm.runPath.replace(/^08_RUNS\//, '06_PROTOCOLS/').replace(/\.md$/i, '') + '_PROMOTED.md'
    const serialized = serializeFrontMatter(frontmatter, '# Promoted protocol\n\nGenerated from run promotion.')
    await repo.writeFile(outPath, serialized)
    promotionForm.status = `Wrote ${outPath}`
    showPromotionModal.value = false
  } catch (err) {
    promotionForm.error = err?.message || 'Promotion failed.'
  }
}

function labwareRowsToMap(rows = []) {
  return rows
    .filter((row) => row.role && row.id)
    .reduce((acc, row) => {
      acc[row.role.trim()] = row.id.trim()
      return acc
    }, {})
}

function validateProtocolFrontmatter(frontmatter) {
  const schema = schemaLoader.schemaBundle?.value?.recordSchemas?.protocol
  if (!schema) return { ok: true, issues: [] }
  try {
    const zodSchema = buildZodSchema(schema, { schemas: schemaLoader.schemaBundle.value.recordSchemas })
    const payload = {
      ...(frontmatter.metadata || {}),
      ...(frontmatter.data || {}),
      ...(frontmatter.data?.operations || {})
    }
    const result = zodSchema.safeParse(payload)
    if (result.success) return { ok: true, issues: [] }
    const issues = result.error.issues.map((issue) => ({
      path: issue.path?.length ? issue.path.join('.') : 'root',
      message: issue.message
    }))
    return { ok: false, issues }
  } catch (err) {
    return { ok: false, issues: [{ path: 'schema', message: err?.message || 'Schema build failed' }] }
  }
}

function handleGraphCreate(payload) {
  if (!payload?.recordType) return
  const metadataPatch = {}
  if (payload.parentField && payload.parentId) {
    metadataPatch[payload.parentField] = payload.parentId
  }
  if (payload.recordType === 'plateLayout') {
    Object.assign(metadataPatch, buildPlateLayoutCreationDefaults(payload.parentNode))
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

function buildPlateLayoutCreationDefaults(parentNode) {
  const titleSource =
    parentNode?.title ||
    parentNode?.frontMatter?.metadata?.title ||
    parentNode?.frontMatter?.title ||
    parentNode?.id ||
    'Run'
  return {
    title: `${titleSource} plate layout`.trim()
  }
}

function buildMetadataPatchFromNode(node) {
  if (!node) return {}
  const patch = {}
  Object.values(relationshipsConfig.value || {}).forEach((descriptor) => {
    Object.values(descriptor?.parents || {}).forEach((parentDef) => {
      if (parentDef?.recordType === node.recordType && parentDef.field) {
        patch[parentDef.field] = node.id
      }
    })
  })
  return patch
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

function openTipTapWindow(path, recordType) {
  if (!path || !recordType) return
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('tiptapPath')
  url.searchParams.delete('tiptapType')
  url.searchParams.delete('tiptapBundle')
  url.searchParams.set('tiptapPath', path)
  url.searchParams.set('tiptapType', recordType)
  const bundle = schemaLoader.selectedBundle?.value
  if (bundle) {
    url.searchParams.set('tiptapBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

function openPlateEditorWindow(path) {
  if (!path) return
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('plateEditorPath')
  url.searchParams.delete('plateEditorBundle')
  url.searchParams.set('plateEditorPath', path)
  const bundle = schemaLoader.selectedBundle?.value
  if (bundle) {
    url.searchParams.set('plateEditorBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

function openProtocolEditorWindow(path) {
  if (!path) return
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('protocolEditorPath')
  url.searchParams.delete('protocolEditorBundle')
  url.searchParams.set('protocolEditorPath', path)
  const bundle = schemaLoader.selectedBundle?.value
  if (bundle) {
    url.searchParams.set('protocolEditorBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

function openRunEditorWindow(path) {
  if (!path) return
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('runEditorPath')
  url.searchParams.delete('runEditorBundle')
  url.searchParams.set('runEditorPath', path)
  const bundle = schemaLoader.selectedBundle?.value
  if (bundle) {
    url.searchParams.set('runEditorBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

function handleGraphOpenTipTap(payload) {
  if (!payload?.path || !payload?.recordType) return
  openTipTapWindow(payload.path, payload.recordType)
}

function handleGraphOpenProtocol(payload) {
  if (!payload) return
  const path = payload.path || payload.node?.path || ''
  if (!path) return
  openProtocolEditorWindow(path)
}

function handleGraphSupportingDoc(payload) {
  if (!payload?.node) return
  openSupportingDocumentFromGraph(payload.node)
}

function handleGraphUseAsSource(node) {
  if (!node) return
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

function handleCreateSelectedRecord() {
  if (!isReady.value) return
  const recordType = selectedRootRecordType.value || defaultGraphRootType.value || ''
  if (!recordType) {
    openCreator()
    return
  }
  const simpleModeTypes = new Set(['project', 'protocol'])
  openCreator({
    recordType,
    simpleMode: simpleModeTypes.has(recordType)
  })
}

function handleCreateProtocol() {
  if (!isReady.value || !protocolEnabled.value) return
  openCreator({
    recordType: 'protocol',
    simpleMode: true
  })
}
</script>

<template>
  <InspectorStandalone
    v-if="isStandaloneInspector"
    :is-online="isOnline"
    :is-ready="isReady"
    :repo="repo"
    :inspector-target="inspectorTarget"
    :schema-loader="schemaLoader"
    :workflow-loader="workflowLoader"
    :record-graph="recordGraph"
    @connect="handleConnect"
    @saved="handleInspectorSaved"
  />
  <SettingsStandalone
    v-else-if="isStandaloneSettings"
    :is-online="isOnline"
    :repo-is-requesting="repo.isRequesting"
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
      :tiptap-workflow-definition="tiptapWorkflowDefinition"
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
    :repo-is-requesting="repo.isRequesting"
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
    :repo-is-requesting="repo.isRequesting"
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
        :is-requesting="repo.isRequesting"
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
      :selected-root-record-type="selectedRootRecordType"
      :top-level-record-types="topLevelRecordTypes"
      :protocol-enabled="protocolEnabled"
      :record-graph="recordGraph"
      :schema-loader="schemaLoader"
      :workflow-loader="workflowLoader"
      :default-graph-root-type="defaultGraphRootType"
      :default-graph-root-label="defaultGraphRootLabel"
      :active-record-path="activeRecordPath"
      :tiptap-supported-types="tiptapSupportedTypes"
      :supporting-document-enabled="supportingDocumentEnabled"
      :root-nodes="rootNodes"
      :is-tree-bootstrapping="isTreeBootstrapping"
      :search-index="searchIndex"
      @update:selected-root-record-type="(val) => (selectedRootRecordType.value = val)"
      @select="handleSelect"
      @expand="handleExpand"
      @create-selected-record="handleCreateSelectedRecord"
      @create-protocol="handleCreateProtocol"
      @open-promotion="openPromotionModal"
      @open-explorer="showExplorerModal = true"
      @open-run-editor="showRunEditorModal = true"
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
      :schema-loader="schemaLoader"
      :workflow-loader="workflowLoader"
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
