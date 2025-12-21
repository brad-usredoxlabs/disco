<script setup>
import { computed, ref, watch } from 'vue'
import AppPanel from '../ui/panels/AppPanel.vue'
import FileTreeBrowser from '../ui/file-tree/FileTreeBrowser.vue'
import BaseModal from '../ui/modal/BaseModal.vue'
import TipTapRecordEditor from '../tiptap/components/TipTapRecordEditor.vue'
import FieldInspector from './FieldInspector.vue'
import GraphQueryPanel from './GraphQueryPanel.vue'
import RecordSearchPanel from './RecordSearchPanel.vue'
import RecordCreatorModal from './RecordCreatorModal.vue'
import GraphTreePanel from './GraphTreePanel.vue'
import PlateEditorShell from '../plate-editor/PlateEditorShell.vue'
import ProtocolEditorShell from '../protocol-editor/ProtocolEditorShell.vue'
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
const tiptapTarget = ref(readTiptapTargetFromUrl())
const plateEditorTarget = ref(readPlateEditorTargetFromUrl())
const protocolEditorTarget = ref(readProtocolEditorTargetFromUrl())
const inspectorTarget = ref(readInspectorTargetFromUrl())
const tiptapStatus = ref('')
const inspectorStatus = ref('')
const shouldShowModal = computed(() => showPrompt.value && !repo.directoryHandle.value && !repo.isRestoring.value)
const connectionLabel = computed(() => repo.statusLabel.value)
const isReady = computed(() => !!repo.directoryHandle.value)
const isStandaloneTiptap = computed(() => !!tiptapTarget.value)
const isStandalonePlateEditor = computed(() => !!plateEditorTarget.value)
const isStandaloneProtocolEditor = computed(() => !!protocolEditorTarget.value)
const isStandaloneInspector = computed(() => !!inspectorTarget.value)
const isOnline = computed(() => offlineStatus.isOnline.value)
const selectedBundleName = computed(() => schemaLoader.selectedBundle.value || '')
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
  [
    () => repo.directoryHandle.value,
    () => schemaLoader.schemaBundle?.value,
    () => systemConfig.bioportalConfig.value
  ],
  ([handle, bundle, bioportal]) => {
    configureOntologyService({
      repoConnection: handle ? repo : null,
      systemConfig: bioportal,
      vocabSchemas: bundle?.vocabSchemas || {}
    })
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
  <div v-if="isStandaloneInspector" class="inspector-standalone">
    <p v-if="!isOnline" class="offline-banner">
      You are currently offline. Cached schema/search data are in use until connectivity returns.
    </p>
    <FieldInspector
      v-if="isReady"
      :repo="repo"
      :record-path="inspectorTarget.path"
      :record-type="''"
      :schema-loader="schemaLoader"
      :workflow-loader="workflowLoader"
      :record-graph="recordGraph"
      @saved="handleInspectorSaved"
    />
    <div v-else class="inspector-standalone__message">
      <p>Connect your repository to view this record.</p>
      <button class="primary" type="button" @click="handleConnect">Select repository folder</button>
    </div>
  </div>
  <div v-else-if="isStandaloneTiptap" class="tiptap-standalone">
    <header class="tiptap-standalone__header">
      <div>
        <p class="app-kicker">TapTab</p>
        <h1>{{ tiptapTarget?.recordType || 'Record' }}</h1>
        <p class="app-subtitle">{{ tiptapTarget?.path }}</p>
      </div>
      <div class="tiptap-standalone__actions">
        <button class="secondary" type="button" :disabled="repo.isRequesting" @click="handleConnect">
          {{ repo.isRequesting ? 'Awaiting permission…' : 'Reconnect repo' }}
        </button>
        <button class="secondary" type="button" @click="clearTiptapTarget">Return to workspace</button>
      </div>
    </header>
    <p v-if="!isOnline" class="offline-banner">
      You are currently offline. Cached schema/search data are in use until connectivity returns.
    </p>
    <div class="tiptap-standalone__body">
      <p v-if="tiptapStatus" class="status status-ok">{{ tiptapStatus }}</p>
      <div v-if="!isReady" class="tiptap-standalone__message">
        <p>Connect your repository to edit this record.</p>
        <button class="primary" type="button" @click="handleConnect">Select repository folder</button>
      </div>
      <div v-else-if="tiptapBundleMismatch" class="tiptap-standalone__message">
        <p>Loading schema bundle {{ tiptapTarget?.bundle }}…</p>
      </div>
      <div v-else-if="!tiptapSupports" class="tiptap-standalone__message">
        <p>This record type is not TapTab-enabled.</p>
      </div>
      <div v-else-if="!tiptapSchema || !tiptapUiConfig" class="tiptap-standalone__message">
        <p>Schema details are still loading…</p>
      </div>
      <div v-else class="tiptap-standalone__editor">
        <TipTapRecordEditor
          :repo="repo"
          :record-path="tiptapTarget.path"
          :record-type="tiptapTarget.recordType"
          :schema="tiptapSchema"
          :ui-config="tiptapUiConfig"
          :naming-rule="tiptapNamingRule || {}"
          :read-only="false"
          :workflow-definition="tiptapWorkflowDefinition"
          :schema-bundle="schemaLoader.schemaBundle?.value || {}"
          :validate-record="recordValidator.validate"
          :project-context-overrides="tiptapContextOverrides.value || {}"
          @close="clearTiptapTarget"
          @saved="handleStandaloneSaved"
        />
      </div>
    </div>
  </div>
  <div v-else-if="isStandalonePlateEditor" class="plate-editor-standalone">
    <header class="plate-editor-standalone__header">
      <div>
        <p class="app-kicker">Plate Editor</p>
        <h1>Plate Layout</h1>
        <p class="app-subtitle">{{ plateEditorTarget?.path }}</p>
      </div>
      <div class="plate-editor-standalone__actions">
        <button class="secondary" type="button" :disabled="repo.isRequesting" @click="handleConnect">
          {{ repo.isRequesting ? 'Awaiting permission…' : 'Reconnect repo' }}
        </button>
        <button class="secondary" type="button" @click="clearPlateEditorTarget">Return to workspace</button>
      </div>
    </header>
    <p v-if="!isOnline" class="offline-banner">
      You are currently offline. Cached schema/search data are in use until connectivity returns.
    </p>
    <div class="plate-editor-standalone__body">
      <div v-if="!isReady" class="plate-editor-standalone__message">
        <p>Connect your repository to edit this plate layout.</p>
        <button class="primary" type="button" @click="handleConnect">Select repository folder</button>
      </div>
      <div v-else-if="plateEditorBundleMismatch" class="plate-editor-standalone__message">
        <p>Loading schema bundle {{ plateEditorTarget?.bundle }}…</p>
      </div>
      <div v-else-if="!plateEditorTarget?.path" class="plate-editor-standalone__message">
        <p>Missing plate layout path.</p>
      </div>
      <div v-else class="plate-editor-standalone__editor">
        <PlateEditorShell
          :repo="repo"
          :record-path="plateEditorTarget.path"
          :schema-loader="schemaLoader"
        />
      </div>
    </div>
  </div>
  <div v-else-if="isStandaloneProtocolEditor" class="protocol-editor-standalone">
    <header class="protocol-editor-standalone__header">
      <div>
        <p class="app-kicker">Protocol Editor</p>
        <h1>Protocol</h1>
        <p class="app-subtitle">{{ protocolEditorTarget?.path }}</p>
      </div>
      <div class="protocol-editor-standalone__actions">
        <button class="secondary" type="button" :disabled="repo.isRequesting" @click="handleConnect">
          {{ repo.isRequesting ? 'Awaiting permission…' : 'Reconnect repo' }}
        </button>
        <button class="secondary" type="button" @click="clearProtocolEditorTarget">Return to workspace</button>
      </div>
    </header>
    <p v-if="!isOnline" class="offline-banner">
      You are currently offline. Cached schema/search data are in use until connectivity returns.
    </p>
    <div class="protocol-editor-standalone__body">
      <div v-if="!isReady" class="protocol-editor-standalone__message">
        <p>Connect your repository to edit this protocol.</p>
        <button class="primary" type="button" @click="handleConnect">Select repository folder</button>
      </div>
      <div v-else-if="protocolEditorBundleMismatch" class="protocol-editor-standalone__message">
        <p>Loading schema bundle {{ protocolEditorTarget?.bundle }}…</p>
      </div>
      <div v-else-if="!protocolEditorTarget?.path" class="protocol-editor-standalone__message">
        <p>Missing protocol path.</p>
      </div>
      <div v-else class="protocol-editor-standalone__editor">
        <ProtocolEditorShell
          :repo="repo"
          :record-path="protocolEditorTarget.path"
          :schema-loader="schemaLoader"
        />
      </div>
    </div>
  </div>
  <div v-else class="app-shell">
    <header class="app-header">
      <div class="header-main">
        <div>
          <p class="app-kicker">Phase 2 · File I/O Layer</p>
          <h1>DIsCo Pages 2.0</h1>
          <p class="app-subtitle">Schema-driven LIS/QMS shell powered by Vue + Vite</p>
        </div>
        <div class="connection-chip" :class="{ 'is-connected': isReady }">
          <span class="chip-label">{{ connectionLabel }}</span>
          <button
            class="pill-button"
            type="button"
            :disabled="!repo.isSupported"
            :class="{ 'is-loading': repo.isRequesting }"
            @click="handleConnect"
          >
            {{ repo.isRequesting ? 'Awaiting…' : isReady ? 'Reconnect' : 'Connect' }}
          </button>
        </div>
      </div>
    </header>
    <p v-if="repo.error" class="status status-error header-status">{{ repo.error }}</p>
    <p v-else-if="repo.isRestoring" class="status status-muted header-status">Restoring previous session…</p>
    <p v-else-if="!repo.isSupported" class="status status-error header-status">
      This browser does not expose the File System Access API.
    </p>
    <p v-if="!isOnline" class="offline-banner">
      Offline mode: editing uses cached schemas and search results. Reconnect to sync with the repo.
    </p>

    <main class="app-main-layout">
      <section class="graph-stage">
        <AppPanel>
          <RecordSearchPanel :search="searchIndex" @open="handleSelect" />
        </AppPanel>
        <AppPanel class="graph-panel">
          <div class="graph-panel__header">
            <div>
              <h2>{{ graphTreeEnabled ? 'Record graph' : 'Repository tree' }}</h2>
              <p v-if="graphTreeEnabled">Config-driven navigation sourced directly from relationships.yaml.</p>
              <p v-else>Fallback tree built from the repo handle while graph mode is disabled.</p>
            </div>
            <div v-if="graphTreeEnabled" class="graph-panel__actions">
              <label class="graph-panel__actions-label" for="graph-create-select">New</label>
              <select
                id="graph-create-select"
                v-model="selectedRootRecordType"
                :disabled="!isReady || !topLevelRecordTypes.length"
              >
                <option v-for="type in topLevelRecordTypes" :key="type" :value="type">
                  {{ type }}
                </option>
              </select>
              <button
                class="ghost-button"
                type="button"
                :disabled="!isReady || !selectedRootRecordType"
                @click="handleCreateSelectedRecord"
              >
                + Add record
              </button>
              <button
                v-if="protocolEnabled"
                class="ghost-button"
                type="button"
                :disabled="!isReady"
                @click="handleCreateProtocol"
              >
                + Add protocol
              </button>
            </div>
          </div>
          <GraphTreePanel
            v-if="graphTreeEnabled"
            :graph-state="recordGraph"
            :schema-loader="schemaLoader"
            :workflow-loader="workflowLoader"
            :default-root-type="defaultGraphRootType"
            :default-root-label="defaultGraphRootLabel"
            :active-path="activeRecordPath"
            :tiptap-record-types="tiptapSupportedTypes"
            :supporting-document-enabled="supportingDocumentEnabled"
            @select-record="handleSelect"
            @create-child="handleGraphCreate"
            @open-tiptap="handleGraphOpenTipTap"
            @open-protocol="handleGraphOpenProtocol"
            @create-supporting-doc="handleGraphSupportingDoc"
          />
          <FileTreeBrowser
            v-else
            :nodes="rootNodes"
            :is-loading="isTreeBootstrapping"
            title="repo root"
            @select="handleSelect"
            @expand="handleExpand"
          />
        </AppPanel>
        <AppPanel v-if="graphQueryEnabled" class="graph-query-panel">
          <GraphQueryPanel
            :graph-state="recordGraph"
            :schema-loader="schemaLoader"
            :workflow-loader="workflowLoader"
          />
        </AppPanel>
      </section>
    </main>

    <BaseModal v-if="shouldShowModal" title="Select your repository" @close="closePrompt">
      <p>
        Pick the root folder that contains <code>records/</code> and <code>schema/</code>. The browser will request
        persistent read/write permission and cache the choice in IndexedDB.
      </p>
      <template #footer>
        <button class="secondary" type="button" @click="closePrompt">Not now</button>
        <button
          class="primary"
          type="button"
          :class="{ 'is-loading': repo.isRequesting }"
          :disabled="!repo.isSupported"
          @click="handleConnect"
        >
          {{ repo.isRequesting ? 'Awaiting permission…' : 'Select folder' }}
        </button>
      </template>
    </BaseModal>
    <component
      v-if="showCreator"
      :is="RecordCreatorModal"
      :open="showCreator"
      :repo="repo"
      :schema-loader="schemaLoader"
      :workflow-loader="workflowLoader"
      :record-graph="recordGraph"
      :on-created="handleRecordCreated"
      :creation-context="creatorContext"
      @close="closeCreator"
    />
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1.5rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.app-kicker {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 0.5rem;
}

.header-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}

.app-header h1 {
  margin: 0;
  font-size: 2.5rem;
}

.app-subtitle {
  margin: 0.2rem 0 0;
  color: #475569;
}

.connection-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #fff;
}

.connection-chip.is-connected {
  border-color: rgba(16, 185, 129, 0.4);
}

.chip-label {
  font-size: 0.85rem;
  color: #0f172a;
}

.header-status {
  margin-top: -1rem;
}

.tiptap-standalone {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.tiptap-standalone__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.tiptap-standalone__actions {
  display: flex;
  gap: 0.5rem;
}

.tiptap-standalone__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tiptap-standalone__message {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  color: #475569;
  background: #f8fafc;
}

.tiptap-standalone__editor {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 1rem;
  background: #fff;
  min-height: 70vh;
}

.plate-editor-standalone {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.plate-editor-standalone__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.plate-editor-standalone__actions {
  display: flex;
  gap: 0.5rem;
}

.plate-editor-standalone__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.plate-editor-standalone__message {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  color: #475569;
  background: #f8fafc;
}

.plate-editor-standalone__editor {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.protocol-editor-standalone {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.protocol-editor-standalone__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.protocol-editor-standalone__actions {
  display: flex;
  gap: 0.5rem;
}

.protocol-editor-standalone__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.protocol-editor-standalone__message {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  color: #475569;
  background: #f8fafc;
}

.protocol-editor-standalone__editor {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.inspector-standalone {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.inspector-standalone__message {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  color: #475569;
  background: #f8fafc;
}

.app-main-layout {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 1.5rem;
}

@media (max-width: 1100px) {
  .app-main-layout {
    grid-template-columns: 1fr;
  }
}

.graph-stage,
.workbench-stage {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.graph-panel__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.graph-panel__header h2 {
  margin: 0;
}

.graph-panel__header p {
  margin: 0.25rem 0 0;
  color: #64748b;
}

.graph-panel__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.graph-panel__actions-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.graph-panel__actions select {
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  padding: 0.3rem 0.6rem;
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

.pill-button {
  border: none;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 0.2rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: #0f172a;
}

.pill-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
</style>
