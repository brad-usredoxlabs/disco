<script setup>
import { computed, ref, watch } from 'vue'
import AppPanel from '../ui/panels/AppPanel.vue'
import FileTreeBrowser from '../ui/file-tree/FileTreeBrowser.vue'
import BaseModal from '../ui/modal/BaseModal.vue'
import FileWorkbench from './FileWorkbench.vue'
import TipTapSandbox from '../tiptap/components/TipTapSandbox.vue'
import TipTapRecordEditor from '../tiptap/components/TipTapRecordEditor.vue'
import SchemaBundlePanel from './SchemaBundlePanel.vue'
import RecordGraphPanel from './RecordGraphPanel.vue'
import GraphQueryPanel from './GraphQueryPanel.vue'
import RecordSearchPanel from './RecordSearchPanel.vue'
import RecordCreatorModal from './RecordCreatorModal.vue'
import GraphTreePanel from './GraphTreePanel.vue'
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
const selectedNode = ref(null)
const showSandbox = import.meta.env.DEV === true
const schemaBundle = computed(() => schemaLoader.schemaBundle?.value)
const recordValidator = useRecordValidator(schemaLoader)
const tiptapTarget = ref(readTiptapTargetFromUrl())
const tiptapStatus = ref('')
const shouldShowModal = computed(() => showPrompt.value && !repo.directoryHandle.value && !repo.isRestoring.value)
const connectionLabel = computed(() => repo.statusLabel.value)
const isReady = computed(() => !!repo.directoryHandle.value)
const isStandaloneTiptap = computed(() => !!tiptapTarget.value)
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
const activeRecordPath = computed(() => selectedNode.value?.path || '')

watch(
  () => tiptapTarget.value?.bundle,
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

watch(
  () => repo.directoryHandle.value,
  (handle) => {
    if (handle) {
      showPrompt.value = false
    } else {
      selectedNode.value = null
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

function handleSelect(node) {
  selectedNode.value = node
}

function openPath(path) {
  if (!path) return
  selectedNode.value = {
    kind: 'file',
    path,
    name: path.split('/').pop() || path
  }
}

function handleRecordCreated(path) {
  showCreator.value = false
  creatorContext.value = null
  if (path) {
    openPath(path)
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

function handleGraphCreate(payload) {
  if (!payload?.recordType) return
  const metadataPatch = {}
  if (payload.parentField && payload.parentId) {
    metadataPatch[payload.parentField] = payload.parentId
  }
  openCreator({
    recordType: payload.recordType,
    metadata: metadataPatch
  })
}
</script>

<template>
  <div v-if="isStandaloneTiptap" class="tiptap-standalone">
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
  <div v-else class="app-shell">
    <header class="app-header">
      <div>
        <p class="app-kicker">Phase 2 · File I/O Layer</p>
        <h1>DIsCo Pages 2.0</h1>
        <p class="app-subtitle">Schema-driven LIS/QMS shell powered by Vue + Vite</p>
      </div>
      <div class="header-actions">
        <button class="primary" type="button" @click="openCreator" :disabled="!isReady">New record</button>
        <div class="connection-pill" :class="{ 'is-connected': isReady }">
          <span>{{ connectionLabel }}</span>
          <button class="pill-button" type="button" @click="reopenPrompt">Choose folder</button>
        </div>
      </div>
    </header>
    <p v-if="!isOnline" class="offline-banner">
      Offline mode: editing uses cached schemas and search results. Reconnect to sync with the repo.
    </p>

    <main class="app-main-grid">
      <div class="column column-left">
        <AppPanel>
          <h2>Repository connection</h2>
          <p>
            The File System Access API stores a user-approved directory handle. All schema, workflow, and record
            operations run directly against this sandboxed repo root.
          </p>

          <div class="action-row">
            <button
              class="primary"
              type="button"
              :class="{ 'is-loading': repo.isRequesting }"
              :disabled="!repo.isSupported"
              @click="handleConnect"
            >
              <span v-if="repo.isRequesting">Awaiting permission…</span>
              <span v-else>{{ isReady ? 'Reconnect' : 'Select repository folder' }}</span>
            </button>
            <button class="secondary" type="button" @click="reopenPrompt">
              Show prompt
            </button>
          </div>

          <p v-if="!repo.isSupported" class="support-warning">
            This browser does not expose the File System Access API. Use a Chromium-based browser to continue.
          </p>
          <p v-else-if="repo.error" class="status status-error">{{ repo.error }}</p>
          <p v-else-if="repo.isRestoring" class="status status-muted">Restoring previous session…</p>
          <p v-else-if="isReady" class="status status-ok">
            Ready to operate against <strong>{{ repo.directoryHandle?.name }}</strong>
          </p>
          <p v-else class="status status-muted">
            Waiting for a repository selection.
          </p>
        </AppPanel>

        <AppPanel class="tree-panel">
          <div class="panel-heading">
            <div>
              <h2>{{ graphTreeEnabled ? 'Record graph' : 'Repository tree' }}</h2>
              <p v-if="graphTreeEnabled">
                Contextual navigation derived from schema relationships. Toggle via <code>features.graphTree</code>.
              </p>
              <p v-else>Lazy-loaded virtual tree stitched from File System Access directory handles.</p>
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
            @select-record="openPath"
            @create-child="handleGraphCreate"
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
      </div>

      <div class="column column-right">
        <AppPanel>
          <SchemaBundlePanel :loader="schemaLoader" />
        </AppPanel>
        <AppPanel>
          <RecordSearchPanel :search="searchIndex" @open="openPath" />
        </AppPanel>
        <AppPanel>
          <RecordGraphPanel :graph-state="recordGraph" />
        </AppPanel>
        <AppPanel v-if="graphQueryEnabled">
          <GraphQueryPanel
            :graph-state="recordGraph"
            :schema-loader="schemaLoader"
            :workflow-loader="workflowLoader"
          />
        </AppPanel>
        <AppPanel class="workbench-panel">
          <FileWorkbench
            :repo="repo"
            :node="selectedNode"
            :schema-loader="schemaLoader"
            :workflow-loader="workflowLoader"
            :record-graph="recordGraph"
            :on-open-path="openPath"
          />
        </AppPanel>
        <AppPanel v-if="showSandbox">
          <TipTapSandbox :repo="repo" />
        </AppPanel>
      </div>
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

.app-header h1 {
  margin: 0;
  font-size: 2.5rem;
}

.app-subtitle {
  margin: 0.2rem 0 0;
  color: #475569;
}

.connection-pill {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #fff;
  min-width: 280px;
}

.connection-pill.is-connected {
  border-color: rgba(16, 185, 129, 0.4);
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

.app-main-grid {
  display: grid;
  grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);
  gap: 1.5rem;
}

@media (max-width: 960px) {
  .app-main-grid {
    grid-template-columns: 1fr;
  }
}

.column {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.panel-heading p {
  margin: 0.2rem 0 1rem;
  color: #64748b;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

code {
  background: #e2e8f0;
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
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
