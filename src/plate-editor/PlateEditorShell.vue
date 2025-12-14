<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { parseFrontMatter, serializeFrontMatter } from '../records/frontMatter'
import { resolvePlateEditorSpec, DEFAULT_PLATE_EDITOR_SPEC_ID } from './specRegistry'
import { usePlateEditorStore } from './store/usePlateEditorStore'
import PlateGrid from './components/PlateGrid.vue'
import ApplyBar from './components/ApplyBar.vue'
import MaterialDetailsDrawer from './components/MaterialDetailsDrawer.vue'
import { useMaterialLibrary } from './composables/useMaterialLibrary'
import { upsertMaterialLibraryEntry } from './services/materialLibraryWriter'

const props = defineProps({
  repo: {
    type: Object,
    required: true
  },
  recordPath: {
    type: String,
    required: true
  },
  schemaLoader: {
    type: Object,
    required: true
  }
})

const loading = ref(false)
const error = ref('')
const lastLoadedAt = ref('')
const actionStatus = ref('')
const store = usePlateEditorStore()
const frontMatterRef = ref({ metadata: {}, data: {} })
const bodyRef = ref('')
const originalHash = ref('')
const saving = ref(false)
const showHelp = ref(true)
const materialLibrary = useMaterialLibrary(props.repo)
const materialPrefill = ref(null)
const materialDrawer = reactive({
  open: false,
  mode: 'create',
  seedLabel: '',
  seedTags: [],
  entry: null
})
const materialDrawerSaving = ref(false)

const recordModel = computed(() => store.state.record || null)
const specModel = computed(() => store.state.spec || null)
const layoutIndex = computed(() => store.state.layoutIndex)

const isRepoReady = computed(() => !!props.repo?.directoryHandle?.value)
const recordTitle = computed(() => recordModel.value?.metadata?.title || 'Plate layout')
const specLabel = computed(() => specModel.value?.label || 'Plate editor')
const availableMaterials = computed(() => {
  if (materialLibrary.entries.value?.length) {
    return materialLibrary.entries.value
  }
  return recordModel.value?.materials || []
})
const materialLibraryIds = computed(() => materialLibrary.entries.value?.map((entry) => entry.id) || [])
const materialCount = computed(() => availableMaterials.value.length)
const wellCount = computed(() => Object.keys(recordModel.value?.wells || {}).length)
const selectionCount = computed(() => store.state.selection.wells.length)
const selectionEmpty = computed(() => selectionCount.value === 0)
const canUndo = computed(() => store.state.history.length > 0)
const canRedo = computed(() => store.state.future.length > 0)
const eventEntries = computed(() => recordModel.value?.events || [])
const specRoles = computed(() => specModel.value?.roleCatalog || [])
const observableFeatures = computed(() => deriveObservableFeatures(recordModel.value?.assay))
const currentHash = computed(() => hashPlateRecord(recordModel.value))
const isDirty = computed(() => Boolean(currentHash.value) && currentHash.value !== originalHash.value)
const canSave = computed(() => isDirty.value && !saving.value)
const timelineForm = reactive({
  kind: 'custom',
  notes: ''
})

const RECENTS_KEY = 'plateEditor.recentMaterials'
const FAVORITES_KEY = 'plateEditor.favoriteMaterials'
const recentMaterialIds = ref(readStoredList(RECENTS_KEY))
const favoriteMaterialIds = ref(readStoredList(FAVORITES_KEY))

watch(
  [() => props.recordPath, isRepoReady],
  () => {
    if (!props.recordPath || !isRepoReady.value) {
      store.initialize({})
      frontMatterRef.value = { metadata: {}, data: {} }
      bodyRef.value = ''
      originalHash.value = ''
      return
    }
    loadRecord()
  },
  { immediate: true }
)

watch(
  () => materialLibrary.entries.value,
  (entries) => {
    store.setMaterialLibrary(entries || [])
  },
  { immediate: true }
)

watch(selectionCount, (count) => {
  if (count > 0) {
    showHelp.value = false
  }
})

function handleApplyBarApply(payload) {
  const materialId = sanitizeMaterialId(payload?.materialId || '')
  if (!materialId || !payload?.role) {
    notifyStatus('Select a material and role before applying.')
    return
  }
  store.applyMaterialUse({
    material: materialId,
    role: payload.role,
    amount: payload.amount || null,
    controlIntents: Array.isArray(payload.controlIntents) ? payload.controlIntents : [],
    label: payload.materialLabel || resolveMaterialLabel(materialId)
  })
  ensureMaterialInPalette(materialId, payload.role)
  addRecentMaterial(materialId)
  const label = payload.materialLabel || resolveMaterialLabel(materialId)
  notifyStatus(`Applied ${label} (${payload.role}) to ${selectionCount.value} wells.`)
}

function handleApplyBarRemove(payload) {
  const materialId = sanitizeMaterialId(payload?.materialId || '')
  if (!materialId) {
    notifyStatus('Select a material to remove.')
    return
  }
  store.removeMaterialUse({
    material: materialId,
    role: payload?.role || null
  })
  const label = resolveMaterialLabel(materialId)
  notifyStatus(`Removed ${label} from ${selectionCount.value} wells.`)
}

function handleFavoriteToggle(payload) {
  const id = payload?.id
  if (!id) return
  const exists = favoriteMaterialIds.value.includes(id)
  favoriteMaterialIds.value = exists
    ? favoriteMaterialIds.value.filter((entry) => entry !== id)
    : [id, ...favoriteMaterialIds.value].slice(0, 24)
  persistStoredList(FAVORITES_KEY, favoriteMaterialIds.value)
}

function handleMaterialCreateRequest(payload) {
  if (!isRepoReady.value) {
    notifyStatus('Connect your repository before creating materials.')
    return
  }
  const label = typeof payload === 'string' ? payload : payload?.label || ''
  const tags = Array.isArray(payload?.tags) ? payload.tags : []
  openMaterialDrawer({
    mode: 'create',
    seedLabel: label,
    seedTags: tags
  })
}

function handleMaterialEditRequest(entry) {
  if (!isRepoReady.value) {
    notifyStatus('Connect your repository before editing materials.')
    return
  }
  if (!entry?.id) return
  openMaterialDrawer({
    mode: 'edit',
    entry
  })
}

function openMaterialDrawer(options = {}) {
  materialDrawer.mode = options.mode || 'create'
  materialDrawer.entry = options.entry || null
  materialDrawer.seedLabel = options.seedLabel || options.entry?.label || ''
  materialDrawer.seedTags = Array.isArray(options.seedTags) ? [...options.seedTags] : []
  materialDrawer.open = true
}

function handleMaterialDrawerClose() {
  materialDrawer.open = false
  materialDrawer.entry = null
  materialDrawer.seedLabel = ''
  materialDrawer.seedTags = []
}

async function handleMaterialDrawerSave(entry) {
  if (!isRepoReady.value) {
    notifyStatus('Connect your repository before saving materials.')
    return
  }
  materialDrawerSaving.value = true
  const drawerMode = materialDrawer.mode
  try {
    const normalized = await upsertMaterialLibraryEntry(props.repo, entry, { insert: 'alphabetical' })
    await materialLibrary.reload()
    handleMaterialDrawerClose()
    materialPrefill.value = { id: normalized.id, nonce: Date.now() }
    ensureMaterialInPalette(normalized.id, normalized.defaults?.role || '')
    addRecentMaterial(normalized.id)
    const verb = drawerMode === 'edit' ? 'Updated' : 'Created'
    notifyStatus(`${verb} ${normalized.label} in the material library.`)
  } catch (err) {
    notifyStatus(err?.message || 'Failed to save material.')
  } finally {
    materialDrawerSaving.value = false
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

async function loadRecord() {
  if (!props.recordPath || !isRepoReady.value) return
  loading.value = true
  error.value = ''
  try {
    const raw = await props.repo.readFile(props.recordPath)
    const { data: frontMatter, body } = parseFrontMatter(raw)
    frontMatterRef.value = frontMatter || { metadata: {}, data: {} }
    bodyRef.value = body || ''
    const model = buildPlateLayoutModel(frontMatter)
    const spec = resolvePlateEditorSpec(model.editorSpecId)
    store.initialize({ record: model, spec, materialLibrary: materialLibrary.entries.value })
    lastLoadedAt.value = new Date().toISOString()
    originalHash.value = hashPlateRecord(model)
    actionStatus.value = ''
  } catch (err) {
    error.value = err?.message || 'Unable to load plate layout.'
  } finally {
    loading.value = false
  }
}

function handleReload() {
  loadRecord()
}

function handleGridInteraction(payload) {
  const wellId = payload?.wellId
  const event = payload?.event
  if (!wellId) return
  if (event?.shiftKey) {
    store.rangeSelect(wellId)
  } else if (event?.metaKey || event?.ctrlKey) {
    store.toggleSelection(wellId)
  } else {
    store.selectSingle(wellId)
  }
}

function handleUndo() {
  store.undo()
  notifyStatus('Undid last action.')
}

function handleRedo() {
  store.redo()
  notifyStatus('Redid action.')
}

const selectionLabel = computed(() => {
  if (!selectionCount.value) return 'No wells selected'
  if (selectionCount.value === 1) return `Selected: ${store.state.selection.wells[0]}`
  return `Selected wells: ${selectionCount.value}`
})

function handleAddTimelineEvent(kindOverride = null) {
  const kind = kindOverride || timelineForm.kind || 'custom'
  if (!store.state.selection.wells.length) {
    notifyStatus('Select at least one well before logging an event.')
    return
  }
  store.appendEvent({
    kind,
    wells: [...store.state.selection.wells],
    payload: {
      notes: timelineForm.notes
    }
  })
  timelineForm.notes = ''
  notifyStatus(`Added ${kind} event for ${selectionCount.value} wells.`)
}

function notifyStatus(message) {
  actionStatus.value = message
  if (message) {
    setTimeout(() => {
      if (actionStatus.value === message) {
        actionStatus.value = ''
      }
    }, 2500)
  }
}

function buildPlateLayoutModel(frontMatter = {}) {
  const metadata = frontMatter.metadata || {}
  const dataSections = frontMatter.data || {}
  const operations = dataSections.operations || {}
  const editorSpecId =
    metadata.editorSpecId ||
    operations.editorSpecId ||
    metadata.formData?.editorSpecId ||
    DEFAULT_PLATE_EDITOR_SPEC_ID
  return {
    metadata,
    dataSections,
    editorSpecId,
    layout: operations.layout || {
      kind: 'plate96',
      wellKeying: 'A01'
    },
    materials: ensureArray(operations.materials),
    wells: isPlainObject(operations.wells) ? { ...operations.wells } : {},
    events: ensureArray(operations.events),
    annotations: isPlainObject(operations.annotations) ? { ...operations.annotations } : {},
    assay: cloneValue(dataSections.assay || operations.assay || null)
  }
}

function ensureArray(value) {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  return [value]
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeMaterialId(value = '') {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const base = trimmed.replace(/^material:/i, '')
  const slug = base
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  if (!slug) return ''
  return `material:${slug}`
}

function ensureMaterialInPalette(materialId, role) {
  if (!store.state.record || !materialId) return
  store.state.record.materials ||= []
  const exists = store.state.record.materials.some((entry) => entry.id === materialId)
  if (exists) return
  store.state.record.materials.push({
    id: materialId,
    label: resolveMaterialLabel(materialId),
    role: role || lookupMaterial(materialId)?.defaults?.role || ''
  })
}

function lookupMaterial(materialId) {
  if (!materialId) return null
  const map = materialLibrary.materialById.value || {}
  return map[materialId] || null
}

function resolveMaterialLabel(materialId, fallback = '') {
  const entry = lookupMaterial(materialId)
  return entry?.label || fallback || materialId
}

function deriveObservableFeatures(assay = null) {
  if (!assay || !Array.isArray(assay.channels)) return []
  const map = new Map()
  assay.channels.forEach((channel) => {
    const feature = channel?.observable_feature || channel?.feature
    const featureId = feature?.id || channel?.id
    if (!featureId) return
    if (!map.has(featureId)) {
      map.set(featureId, {
        id: featureId,
        label: feature?.label || featureId,
        channelId: channel?.id || ''
      })
    }
  })
  return Array.from(map.values())
}

function hashPlateRecord(model) {
  if (!model) return ''
  const normalized = serializePlateOperations(model)
  return JSON.stringify(normalized)
}

function serializePlateOperations(model) {
  if (!model) return {}
  return {
    layout: cloneValue(model.layout || {}),
    materials: sortMaterials(model.materials || []),
    wells: sortWells(model.wells || {}),
    events: sortEvents(model.events || []),
    annotations: cloneValue(model.annotations || {})
  }
}

function addRecentMaterial(materialId) {
  if (!materialId) return
  const next = [materialId, ...recentMaterialIds.value.filter((entry) => entry !== materialId)].slice(0, 12)
  recentMaterialIds.value = next
  persistStoredList(RECENTS_KEY, next)
}

function readStoredList(key) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistStoredList(key, list) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // Ignore storage failures
  }
}

function cloneValue(value) {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

function cloneArray(list) {
  return list.map((entry) => cloneValue(entry))
}

function sortWells(wellMap = {}) {
  const entries = Object.entries(wellMap).sort(([a], [b]) => a.localeCompare(b))
  const sorted = {}
  entries.forEach(([wellId, data]) => {
    const inputs = Array.isArray(data.inputs) ? [...data.inputs] : []
    inputs.sort((a, b) => {
      const aKey = `${a.role || ''}:${a.material?.id || ''}`
      const bKey = `${b.role || ''}:${b.material?.id || ''}`
      return aKey.localeCompare(bKey)
    })
    sorted[wellId] = {
      ...data,
      inputs
    }
  })
  return sorted
}

function sortEvents(events = []) {
  return events.map((event) => ({
    ...event,
    wells: Array.isArray(event.wells) ? [...event.wells].sort() : []
  }))
}

function sortMaterials(materials = []) {
  return cloneArray(materials).sort((a, b) => {
    const aLabel = a.label || a.id || ''
    const bLabel = b.label || b.id || ''
    return aLabel.localeCompare(bLabel)
  })
}

async function handleSave() {
  if (!canSave.value) return
  saving.value = true
  try {
    const normalizedOps = serializePlateOperations(recordModel.value)
    const frontMatter = cloneValue(frontMatterRef.value)
    const data = frontMatter.data || {}
    data.operations = {
      ...(data.operations || {}),
      ...normalizedOps
    }
    frontMatter.data = data
    frontMatter.metadata ||= {}
    frontMatter.metadata.editorSpecId = recordModel.value?.editorSpecId || frontMatter.metadata.editorSpecId
    const serialized = serializeFrontMatter(frontMatter, bodyRef.value || '')
    await props.repo.writeFile(props.recordPath, serialized)
    originalHash.value = currentHash.value
    notifyStatus('Plate layout saved.')
  } catch (err) {
    notifyStatus(err?.message || 'Failed to save plate layout.')
  } finally {
    saving.value = false
  }
}

function handleBeforeUnload(event) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

function openInspectorWindow() {
  if (typeof window === 'undefined' || !props.recordPath) return
  const url = new URL(window.location.href)
  url.searchParams.delete('inspectorPath')
  url.searchParams.delete('inspectorBundle')
  url.searchParams.set('inspectorPath', props.recordPath)
  if (props.schemaLoader?.selectedBundle?.value) {
    url.searchParams.set('inspectorBundle', props.schemaLoader.selectedBundle.value)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

</script>

<template>
  <div class="plate-editor-shell">
    <header class="plate-editor-shell__header">
      <div>
        <p class="app-kicker">Plate Editor</p>
        <h1>{{ recordTitle }}</h1>
        <p class="app-subtitle">{{ recordPath }}</p>
        <p class="app-meta">
          {{ specLabel }} · {{ wellCount }} wells · {{ materialCount }} materials
          <span v-if="lastLoadedAt"> · Loaded {{ new Date(lastLoadedAt).toLocaleTimeString() }}</span>
        </p>
      </div>
      <div class="header-actions">
        <button class="ghost-button" type="button" :disabled="loading" @click="handleReload">Reload</button>
        <button class="ghost-button" type="button" @click="openInspectorWindow">Open raw record</button>
        <button class="primary" type="button" :disabled="!canSave" @click="handleSave">
          {{ saving ? 'Saving…' : isDirty ? 'Save changes' : 'Saved' }}
        </button>
      </div>
    </header>

    <p v-if="!isRepoReady" class="status status-muted">
      Connect your repository to load plate layout data.
    </p>
    <p v-else-if="error" class="status status-error">{{ error }}</p>
    <p v-else-if="loading" class="status status-muted">Loading plate layout…</p>
    <p v-else-if="actionStatus" class="status status-ok">{{ actionStatus }}</p>

    <div v-if="recordModel && specModel" class="plate-editor-layout">
      <aside class="materials-panel">
        <h3>Apply materials</h3>
        <p class="panel-subtitle">Pick a role, choose a material, and apply to the selected wells.</p>
        <ApplyBar
          :roles="specRoles"
          :materials="availableMaterials"
          :selection-count="selectionCount"
          :recent-ids="recentMaterialIds"
          :favorite-ids="favoriteMaterialIds"
          :features="observableFeatures"
          :prefill-selection="materialPrefill"
          @apply="handleApplyBarApply"
          @remove="handleApplyBarRemove"
          @favorite-toggle="handleFavoriteToggle"
          @request-create="handleMaterialCreateRequest"
          @request-edit="handleMaterialEditRequest"
        />
      </aside>

      <section class="grid-panel">
        <div class="grid-toolbar">
          <div class="selection-chip">{{ selectionLabel }}</div>
          <div class="toolbar-actions">
            <button class="ghost-button" type="button" @click="showHelp = !showHelp">
              {{ showHelp ? 'Hide help' : 'Show help' }}
            </button>
            <button type="button" :disabled="!canUndo" @click="handleUndo">Undo</button>
            <button type="button" :disabled="!canRedo" @click="handleRedo">Redo</button>
          </div>
        </div>
        <div v-if="layoutIndex">
          <PlateGrid
            :layout-index="layoutIndex"
            :wells="recordModel?.wells || {}"
            :selection="store.state.selection.wells"
            @well-click="handleGridInteraction"
          />
          <div v-if="showHelp" class="grid-help">
            <h4>How to edit</h4>
            <ul>
              <li>Click: select a single well.</li>
              <li>Shift + click: select a rectangular range.</li>
              <li>Ctrl/Cmd + click: toggle wells in the selection.</li>
              <li>Use the Apply bar to add/remove materials for the selection.</li>
            </ul>
          </div>
        </div>
        <p v-else class="status status-muted">Layout data missing from record.</p>
      </section>

      <aside class="timeline-panel">
        <h3>Timeline</h3>
        <p class="panel-subtitle">Event stream ({{ eventEntries.length }})</p>
        <ul>
          <li v-if="!eventEntries.length" class="empty">No events recorded yet.</li>
          <li v-for="event in eventEntries" :key="event.id || event.timestamp">
            <strong>{{ event.kind || 'event' }}</strong>
            <span> · {{ event.wells?.length || 0 }} wells</span>
            <p v-if="event.timestamp">{{ event.timestamp }}</p>
            <p v-if="event.payload?.notes" class="event-notes">{{ event.payload.notes }}</p>
          </li>
        </ul>
        <div class="timeline-form">
          <label>Event kind</label>
          <select v-model="timelineForm.kind">
            <option value="apply_material">Apply material</option>
            <option value="incubate">Incubate</option>
            <option value="transfer">Transfer</option>
            <option value="measure">Measure</option>
            <option value="custom">Custom</option>
          </select>
          <label>Notes</label>
          <textarea v-model="timelineForm.notes" rows="3" placeholder="Describe event or instrument settings" />
          <button class="primary" type="button" :disabled="selectionEmpty" @click="handleAddTimelineEvent()">Add event</button>
        </div>
      </aside>
    </div>

    <footer class="status-bar">
      <span>Selection: {{ selectionCount }} wells</span>
      <span>History: {{ store.state.history.length }} actions · Redo stack: {{ store.state.future.length }}</span>
    </footer>

    <MaterialDetailsDrawer
      v-model="materialDrawer.open"
      :mode="materialDrawer.mode"
      :entry="materialDrawer.entry"
      :seed-label="materialDrawer.seedLabel"
      :seed-tags="materialDrawer.seedTags"
      :role-options="specRoles"
      :existing-ids="materialLibraryIds"
      :saving="materialDrawerSaving"
      @cancel="handleMaterialDrawerClose"
      @save="handleMaterialDrawerSave"
    />
  </div>
</template>

<style scoped>
.plate-editor-shell {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.plate-editor-shell__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.app-meta {
  color: #475569;
  font-size: 0.9rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.plate-editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 6fr) minmax(0, 3fr);
  gap: 1rem;
}

.materials-panel,
.timeline-panel {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-subtitle {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
}

.grid-panel {
  border: 1px solid #dbeafe;
  border-radius: 16px;
  padding: 1rem;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.grid-help {
  margin-top: 0.75rem;
  border: 1px dashed #93c5fd;
  border-radius: 10px;
  padding: 0.75rem 1rem;
  background: #eff6ff;
  color: #0f172a;
}

.grid-help h4 {
  margin: 0 0 0.35rem;
}

.grid-help ul {
  margin: 0;
  padding-left: 1.25rem;
  color: #1e3a8a;
  font-size: 0.9rem;
}

.grid-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selection-chip {
  background: #e0f2fe;
  color: #0369a1;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.85rem;
}

.toolbar-actions {
  display: flex;
  gap: 0.5rem;
}

.timeline-panel ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timeline-panel li {
  font-size: 0.9rem;
}

.timeline-panel li.empty {
  color: #94a3b8;
  font-style: italic;
}

.timeline-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border-top: 1px solid #e2e8f0;
  padding-top: 0.75rem;
}

.timeline-form textarea,
.timeline-form select {
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
}

.event-notes {
  margin: 0.2rem 0 0;
  color: #475569;
  font-size: 0.85rem;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid #e2e8f0;
  font-size: 0.85rem;
  color: #475569;
}

.primary {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.danger {
  background: #fee2e2;
  color: #991b1b;
  border: none;
  border-radius: 8px;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}

.ghost-button {
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  background: transparent;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}

@media (max-width: 1100px) {
  .plate-editor-layout {
    grid-template-columns: 1fr;
  }
}
</style>
