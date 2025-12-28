<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { parseFrontMatter, serializeFrontMatter } from '../records/frontMatter'
import { resolvePlateEditorSpec, DEFAULT_PLATE_EDITOR_SPEC_ID } from './specRegistry'
import { usePlateEditorStore } from './store/usePlateEditorStore'
import { useGridSelection } from './composables/useGridSelection'
import TransferStepSidecar from './components/TransferStepSidecar.vue'
import LabwareGrid from './components/LabwareGrid.vue'
import PlateGrid from './components/PlateGrid.vue'
import ApplyBar from './components/ApplyBar.vue'
import MaterialDetailsDrawer from './components/MaterialDetailsDrawer.vue'
import { useMaterialLibrary } from './composables/useMaterialLibrary'
import { loadLabwareLibrary, resolveLabwareLayout } from './utils/labwareLibrary'
import { resolveLayoutIndex } from './utils/layoutResolver'
import { writeMaterialConcept, writeMaterialRevision, rebuildMaterialsIndex } from '../vocab/materialWriter'
import BaseModal from '../ui/modal/BaseModal.vue'

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
const revisionModal = reactive({
  open: false,
  material: null,
  changes: '',
  error: ''
})

const recordModel = computed(() => store.state.record || null)
const specModel = computed(() => store.state.spec || null)
const layoutIndex = computed(() => store.state.layoutIndex)

const sourceSelection = useGridSelection(layoutIndex)
const targetSelection = useGridSelection(layoutIndex)
const transferFocusSide = ref('target')
const transferParameterNames = computed(() => [])
const labwareEntries = ref([])
const sourceLabwareId = ref('')
const targetLabwareId = ref('')
const sourceLayoutIndexDisplay = computed(() => resolveSelectedLayout(sourceLabwareId.value) || layoutIndex.value)
const targetLayoutIndexDisplay = computed(() => resolveSelectedLayout(targetLabwareId.value) || layoutIndex.value)
const activeSelection = computed(() =>
  transferFocusSide.value === 'source' ? sourceSelection.selection.value : targetSelection.selection.value
)

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
const selectionCount = computed(() => activeSelection.value.length)
const selectionEmpty = computed(() => selectionCount.value === 0)
const sourceSelectionCount = computed(() => sourceSelection.selection.value.length)
const targetSelectionCount = computed(() => targetSelection.selection.value.length)
const canUndo = computed(() => store.state.history.length > 0)
const canRedo = computed(() => store.state.future.length > 0)
const eventEntries = computed(() => formatEventSummaries(recordModel.value?.events || []))
const specRoles = computed(() => specModel.value?.roleCatalog || [])
const observableFeatures = computed(() => deriveObservableFeatures(recordModel.value?.assay))
const currentHash = computed(() => hashPlateRecord(recordModel.value))
const isDirty = computed(() => Boolean(currentHash.value) && currentHash.value !== originalHash.value)
const canSave = computed(() => isDirty.value && !saving.value)
const timelineForm = reactive({
  kind: 'custom',
  notes: ''
})

onMounted(async () => {
  await loadLabwareCatalog()
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
      sourceSelection.reset()
      targetSelection.reset()
      setDefaultLabwareSelections()
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

watch(
  () => targetSelection.selection.value,
  (wells) => {
    if (transferFocusSide.value === 'target') {
      store.setSelection(wells)
    }
  },
  { deep: true }
)

watch(
  () => sourceSelection.selection.value,
  (wells) => {
    if (transferFocusSide.value === 'source') {
      store.setSelection(wells)
    }
  },
  { deep: true }
)

watch(layoutIndex, () => {
  sourceSelection.reset()
  targetSelection.reset()
})

function handleApplyBarApply(payload) {
  const materialId = sanitizeMaterialId(payload?.materialId || '')
  const materialRevision = payload?.materialRevision || ''
  const wells = activeSelection.value
  if (!materialId || !payload?.role) {
    notifyStatus('Select a material and role before applying.')
    return
  }
  if (!wells.length) {
    notifyStatus('Select at least one well before applying materials.')
    return
  }
  store.applyMaterialUse({
    material: materialId,
    materialRevision,
    role: payload.role,
    amount: payload.amount || null,
    controlIntents: Array.isArray(payload.controlIntents) ? payload.controlIntents : [],
    label: payload.materialLabel || resolveMaterialLabel(materialId),
    wells,
    labware: resolveLabwareRefForSide(transferFocusSide.value)
  })
  ensureMaterialInPalette(materialId, payload.role)
  addRecentMaterial(materialId)
  const label = payload.materialLabel || resolveMaterialLabel(materialId)
  notifyStatus(
    `Applied ${label} (${payload.role}) to ${selectionCount.value} ${transferFocusSide.value} well(s).`
  )
}

function handleApplyBarRemove(payload) {
  const materialId = sanitizeMaterialId(payload?.materialId || '')
  const wells = activeSelection.value
  if (!materialId) {
    notifyStatus('Select a material to remove.')
    return
  }
  if (!wells.length) {
    notifyStatus('Select at least one well before removing materials.')
    return
  }
  store.removeMaterialUse({
    material: materialId,
    role: payload?.role || null,
    wells,
    labware: resolveLabwareRefForSide(transferFocusSide.value)
  })
  const label = resolveMaterialLabel(materialId)
  notifyStatus(`Removed ${label} from ${selectionCount.value} ${transferFocusSide.value} well(s).`)
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

function handleRequestRevision(material = {}) {
  if (!material?.id) {
    notifyStatus('Select a material before creating a revision.')
    return
  }
  revisionModal.material = material
  revisionModal.changes = ''
  revisionModal.error = ''
  revisionModal.open = true
}

async function handleConfirmRevision() {
  const material = revisionModal.material
  const changes = revisionModal.changes?.trim()
  if (!material?.id) {
    revisionModal.error = 'Material is required.'
    return
  }
  if (!changes) {
    revisionModal.error = 'Changes summary is required.'
    return
  }
  revisionModal.error = ''
  try {
    const baseRevision = material.latest_revision || {}
    const nextRevisionNumber = (Number(baseRevision.revision) || 1) + 1
    const payload = {
      ...baseRevision,
      id: material.id,
      label: material.label,
      category: material.category,
      experimental_intents: material.experimental_intents || baseRevision.experimental_intents || [],
      tags: material.tags || baseRevision.tags || [],
      xref: material.xref || baseRevision.xref || {},
      aliases: material.aliases || baseRevision.aliases || [],
      classified_as: material.classified_as || baseRevision.classified_as || [],
      mechanism: material.mechanism || baseRevision.mechanism || {},
      affected_process: material.affected_process || baseRevision.affected_process || {},
      measures: material.measures || baseRevision.measures || [],
      detection: material.detection || baseRevision.detection || {},
      control_role: material.control_role || baseRevision.control_role || '',
      control_for: material.control_for || baseRevision.control_for || {},
      revision: nextRevisionNumber,
      changes_summary: changes,
      status: 'active'
    }
    const { revision } = await writeMaterialRevision(props.repo, payload, { createdBy: 'user' })
    await rebuildMaterialsIndex(props.repo)
    await materialLibrary.reload()
    notifyStatus(`Created revision ${revision.id}`)
    closeRevisionModal()
  } catch (err) {
    revisionModal.error = err?.message || 'Failed to create revision.'
  }
}

function closeRevisionModal() {
  revisionModal.open = false
  revisionModal.material = null
  revisionModal.changes = ''
  revisionModal.error = ''
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
    const saved = await writeMaterialConceptAndRevision(entry)
    await materialLibrary.reload()
    handleMaterialDrawerClose()
    materialPrefill.value = { id: saved.concept.id, nonce: Date.now() }
    ensureMaterialInPalette(saved.concept.id, saved.concept.defaults?.role || '')
    addRecentMaterial(saved.concept.id)
    const verb = drawerMode === 'edit' ? 'Updated' : 'Created'
    notifyStatus(`${verb} ${saved.concept.label} in the material library.`)
  } catch (err) {
    notifyStatus(err?.message || 'Failed to save material.')
  } finally {
    materialDrawerSaving.value = false
  }
}

async function writeMaterialConceptAndRevision(entry = {}) {
  const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z')
  const payload = {
    ...entry,
    changes_summary: entry.changes_summary || 'Initial import'
  }
  const conceptResult = await writeMaterialConcept(props.repo, payload, { timestamp })
  const revisionResult = await writeMaterialRevision(props.repo, payload, { timestamp, createdBy: 'user' })
  await rebuildMaterialsIndex(props.repo)
  return { concept: conceptResult.concept, revision: revisionResult.revision }
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
  sourceSelection.reset()
  targetSelection.reset()
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
  const selectionApi = transferFocusSide.value === 'source' ? sourceSelection : targetSelection
  if (event?.shiftKey) {
    selectionApi.rangeSelect(wellId)
  } else if (event?.metaKey || event?.ctrlKey) {
    selectionApi.toggleSelection(wellId)
  } else {
    selectionApi.selectSingle(wellId)
  }
}

function handleTransferFocusSide(side) {
  transferFocusSide.value = side === 'source' ? 'source' : 'target'
  store.setSelection(activeSelection.value)
}

function handleSourceSelectionUpdate(wells = []) {
  sourceSelection.setSelection(wells || [])
  if (transferFocusSide.value === 'source') {
    store.setSelection(sourceSelection.selection.value)
  }
}

function handleTargetSelectionUpdate(wells = []) {
  targetSelection.setSelection(wells || [])
  if (transferFocusSide.value === 'target') {
    store.setSelection(targetSelection.selection.value)
  }
}

function handleSourceGridInteraction(payload) {
  const wellId = payload?.wellId
  const event = payload?.event
  if (!wellId) return
  transferFocusSide.value = 'source'
  if (event?.shiftKey) {
    sourceSelection.rangeSelect(wellId)
  } else if (event?.metaKey || event?.ctrlKey) {
    sourceSelection.toggleSelection(wellId)
  } else {
    sourceSelection.selectSingle(wellId)
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
  if (selectionCount.value === 1) return `Selected (${transferFocusSide.value}): ${activeSelection.value[0]}`
  return `${selectionCount.value} ${transferFocusSide.value} well(s)`
})

function handleAddTimelineEvent(kindOverride = null) {
  const kind = kindOverride || timelineForm.kind || 'custom'
  if (kind === 'transfer') {
    const mapping = buildSelectionMapping()
    if (!mapping.length) {
      notifyStatus('Select at least one source and one target well before logging a transfer.')
      return
    }
    const eventPayload = buildTransferEventFromMapping(mapping, timelineForm.notes)
    store.appendEvent(eventPayload)
    timelineForm.notes = ''
    notifyStatus(`Added transfer event with ${mapping.length} mapping(s).`)
    return
  }
  if (!activeSelection.value.length) {
    notifyStatus('Select at least one well before logging an event.')
    return
  }
  const eventPayload = buildTimelineEvent(kind, timelineForm.notes, activeSelection.value)
  store.appendEvent(eventPayload)
  timelineForm.notes = ''
  notifyStatus(`Added ${kind} event for ${selectionCount.value} wells.`)
}

function handleCreateTransferStep(step) {
  let mapping = Array.isArray(step?.details?.mapping) ? step.details.mapping : []
  if (!mapping.length) {
    mapping = buildSelectionMapping()
  }
  const mappingCount = mapping.length
  if (!mappingCount) {
    notifyStatus('Add at least one mapping before creating a transfer step.')
    return
  }
  const targetWells = buildTargetWellsFromMapping(mapping, {
    material: step.details.material,
    volume: step.details.volume
  })

  store.appendEvent({
    event_type: 'transfer',
    timestamp: new Date().toISOString(),
    run: recordModel.value?.metadata?.runId || '',
    labware: [],
    details: {
      type: 'transfer',
      source_role: step.details.source_role,
      target_role: step.details.target_role,
      mapping,
      volume: step.details.volume || '',
      material: step.details.material || null,
      target: {
        wells: targetWells
      }
    },
    label: step.label || 'Transfer',
    notes: step.notes || ''
  })
  notifyStatus(`Added transfer step with ${mappingCount} mapping(s).`)
}

function buildSelectionMapping() {
  const source = orderWells(sourceSelection.selection.value, layoutIndex.value)
  const target = orderWells(targetSelection.selection.value, layoutIndex.value)
  if (!target.length || !source.length) return []
  if (source.length === 1) {
    return target.map((t) => ({ source_well: source[0], target_well: t }))
  }
  const count = Math.min(source.length, target.length)
  return Array.from({ length: count }).map((_, idx) => ({
    source_well: source[idx],
    target_well: target[idx]
  }))
}

function orderWells(wells = [], index) {
  if (!Array.isArray(wells) || !wells.length) return []
  if (!index?.positionById) return [...wells].sort()
  const rank = index.positionById
  return [...wells].sort((a, b) => {
    const pa = rank[a] || {}
    const pb = rank[b] || {}
    if (pa.rowIndex === pb.rowIndex) {
      return (pa.columnIndex || 0) - (pb.columnIndex || 0)
    }
    return (pa.rowIndex || 0) - (pb.rowIndex || 0)
  })
}

function buildTransferEventFromMapping(mapping = [], notes = '') {
  const labwareRef = resolvePlateLabwareRef()
  const targetWells = buildTargetWellsFromMapping(mapping, { volume: '' })
  return {
    event_type: 'transfer',
    timestamp: new Date().toISOString(),
    run: recordModel.value?.metadata?.runId || '',
    labware: labwareRef ? [labwareRef] : [],
    details: {
      type: 'transfer',
      source_role: 'source_plate',
      target_role: 'target_plate',
      mapping,
      target: {
        wells: targetWells
      }
    },
    label: 'Transfer',
    notes
  }
}

function buildTargetWellsFromMapping(mapping = [], options = {}) {
  const wells = {}
  if (!Array.isArray(mapping)) return wells
  mapping.forEach((entry) => {
    if (!entry?.target_well) return
    wells[entry.target_well] = {
      well: entry.target_well,
      material_id: options.material?.id || '',
      material_label: options.material?.label || '',
      role: entry.role || '',
      volume: entry.volume || options.volume || ''
    }
  })
  return wells
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

function formatEventSummaries(events = []) {
  return events.map((event) => {
    if (event?.event_type) {
      return formatStructuredEvent(event)
    }
    return {
      id: resolveEventId(event),
      label: event?.kind || 'event',
      timestamp: event?.timestamp || '',
      wellSummary: summarizeLegacyWells(event),
      notes: event?.payload?.notes || ''
    }
  })
}

function formatStructuredEvent(event = {}) {
  return {
    id: resolveEventId(event),
    label: event.label || event.event_type,
    timestamp: event.timestamp || '',
    wellSummary: summarizeStructuredWells(event),
    notes: extractStructuredNotes(event)
  }
}

function summarizeStructuredWells(event = {}) {
  if (event.event_type === 'transfer') {
    const mappingCount = Array.isArray(event.details?.mapping) ? event.details.mapping.length : 0
    if (mappingCount) {
      return `${mappingCount} mapping${mappingCount === 1 ? '' : 's'}`
    }
    const count = Object.keys(event.details?.target?.wells || {}).length
    return `${count} well${count === 1 ? '' : 's'}`
  }
  if (event.event_type === 'wash') {
    const wells = Array.isArray(event.details?.wells) ? event.details.wells.length : 0
    return wells ? `${wells} well${wells === 1 ? '' : 's'}` : 'All wells'
  }
  if (event.event_type === 'incubate') {
    const wells = Array.isArray(event.details?.wells) ? event.details.wells.length : 0
    return wells ? `${wells} well${wells === 1 ? '' : 's'}` : 'All wells'
  }
  return summarizeLegacyWells(event)
}

function summarizeLegacyWells(event = {}) {
  const count = Array.isArray(event?.wells) ? event.wells.length : 0
  if (!count) return 'All wells'
  return `${count} well${count === 1 ? '' : 's'}`
}

function extractStructuredNotes(event = {}) {
  if (event.notes) {
    return event.notes
  }
  if (event.event_type === 'transfer') {
    return event.details?.material?.label || 'Transfer'
  }
  if (event.event_type === 'wash') {
    return `Wash ${event.details?.buffer?.label || ''}`.trim()
  }
  if (event.event_type === 'other') {
    return event.details?.description || ''
  }
  if (event.details?.notes) {
    return event.details.notes
  }
  return ''
}

function buildTimelineEvent(kind = 'custom', notes = '', wells = []) {
  const labwareRef = resolvePlateLabwareRef()
  return {
    event_type: 'other',
    timestamp: new Date().toISOString(),
    run: recordModel.value?.metadata?.runId || '',
    labware: labwareRef ? [labwareRef] : [],
    details: {
      type: 'other',
      name: kind || 'custom',
      description: notes || '',
      metadata: {
        wells: [...wells]
      }
    }
  }
}

async function loadLabwareCatalog() {
  try {
    const mod = await import('./utils/labwareLibrary.js')
    const loader = mod?.loadLabwareLibrary
    const entries = loader ? await loader(props.repo) : []
    if (Array.isArray(entries) && entries.length) {
      labwareEntries.value = entries
    } else {
      labwareEntries.value = fallbackLabware()
    }
    setDefaultLabwareSelections()
  } catch (err) {
    console.warn('Failed to load labware library', err)
    labwareEntries.value = fallbackLabware()
    setDefaultLabwareSelections()
  }
}

function setDefaultLabwareSelections() {
  if (!labwareEntries.value?.length) return
  if (!sourceLabwareId.value) {
    sourceLabwareId.value = labwareEntries.value[0].id
  }
  if (!targetLabwareId.value) {
    const preferred = labwareEntries.value.find((entry) => entry.id === 'plate:96')
    targetLabwareId.value = preferred?.id || labwareEntries.value[0].id
  }
}

function resolveSelectedLayout(labwareId) {
  if (!labwareId) return null
  const entry = labwareEntries.value.find((item) => item.id === labwareId)
  if (!entry) return null
  const layout = resolveLabwareLayout(entry)
  if (!layout) return null
  return resolveLayoutIndex(layout)
}

function fallbackLabware() {
  return [
    { id: 'plate:96', label: '96-well plate', kind: 'plate', layout: { rows: 8, columns: 12, wellKeying: 'A01' } },
    { id: 'plate:384', label: '384-well plate', kind: 'plate', layout: { rows: 16, columns: 24, wellKeying: 'A01' } },
    { id: 'plate:24', label: '24-well plate', kind: 'plate', layout: { rows: 4, columns: 6, wellKeying: 'A01' } },
    { id: 'tubeset:8', label: '8-tube strip', kind: 'tubeset', layout: { rows: 1, columns: 8, wellKeying: 'T01' } },
    { id: 'reservoir:12', label: '12-channel reservoir', kind: 'reservoir', layout: { rows: 1, columns: 12, wellKeying: 'R1C1' } }
  ]
}

function resolveLabwareRefForSide(side = 'target') {
  const labwareId = side === 'source' ? sourceLabwareId.value : targetLabwareId.value
  const entry = labwareEntries.value.find((item) => item.id === labwareId)
  if (entry) {
    return {
      '@id': entry.id || `labware/${side}`,
      kind: entry.kind || 'plate',
      label: entry.label || labwareId || side
    }
  }
  return resolvePlateLabwareRef()
}

function resolvePlateLabwareRef() {
  const metadata = recordModel.value?.metadata || {}
  const recordId = metadata.recordId || metadata.id || 'unknown'
  return {
    '@id': `plate/${recordId}`,
    kind: 'plate',
    label: metadata.title || recordId
  }
}

function resolveEventId(event = {}) {
  return event.id || `evt-${Math.random().toString(36).slice(2, 9)}`
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
  return events.map((event) => {
    if (event?.event_type) {
      return sortStructuredEvent(event)
    }
    return {
      ...event,
      wells: Array.isArray(event.wells) ? [...event.wells].sort() : []
    }
  })
}

function sortStructuredEvent(event) {
  const clone = cloneValue(event)
  if (clone.details?.target?.wells && typeof clone.details.target.wells === 'object') {
    clone.details.target.wells = Object.keys(clone.details.target.wells)
      .sort()
      .reduce((acc, key) => {
        acc[key] = clone.details.target.wells[key]
        return acc
      }, {})
  }
  return clone
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

    <div v-if="recordModel && specModel" class="plate-editor-shell__content">
      <section class="timeline-panel timeline-panel--wide">
        <h3>Timeline</h3>
        <p class="panel-subtitle">Event stream ({{ eventEntries.length }})</p>
        <ul>
          <li v-if="!eventEntries.length" class="empty">No events recorded yet.</li>
          <li v-for="event in eventEntries" :key="event.id">
            <strong>{{ event.label }}</strong>
            <span> · {{ event.wellSummary }}</span>
            <p v-if="event.timestamp">{{ event.timestamp }}</p>
            <p v-if="event.notes" class="event-notes">{{ event.notes }}</p>
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
      </section>

      <div class="plate-editor-layout">
        <aside class="materials-panel">
          <TransferStepSidecar
            :focus-side="transferFocusSide"
            mode="run"
            :source-selection="sourceSelection.selection"
            :target-selection="targetSelection.selection"
            :parameter-names="transferParameterNames"
            source-role="source_plate"
            target-role="target_plate"
            @update:focus-side="handleTransferFocusSide"
            @update:source-selection="handleSourceSelectionUpdate"
            @update:target-selection="handleTargetSelectionUpdate"
            @create-step="handleCreateTransferStep"
          />
        <div class="labware-selectors" v-if="labwareEntries.length">
          <label>
            Source labware
            <select v-model="sourceLabwareId">
              <option v-for="entry in labwareEntries" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
            </select>
          </label>
          <label>
            Target labware
            <select v-model="targetLabwareId">
              <option v-for="entry in labwareEntries" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
            </select>
          </label>
          <p class="labware-hint">Selections apply immediately to the grids below.</p>
        </div>
          <LabwareGrid
            v-if="sourceLayoutIndexDisplay"
            :layout-index="sourceLayoutIndexDisplay"
            :wells="recordModel?.wells || {}"
            :selection="sourceSelection.selection"
            title="Source selection"
            :subtitle="`Use shift/cmd to multi-select · ${sourceSelectionCount} selected`"
            @well-click="handleSourceGridInteraction"
          />
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
            @request-revision="handleRequestRevision"
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
              :layout-index="targetLayoutIndexDisplay || layoutIndex"
              :wells="recordModel?.wells || {}"
              :selection="targetSelection.selection"
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
      </div>
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
    <BaseModal v-if="revisionModal.open" title="Create material revision" @close="closeRevisionModal">
      <template #body>
        <div class="modal-form">
          <p class="status">
            Base: {{ revisionModal.material?.id }} ({{ revisionModal.material?.label }})
          </p>
          <p class="status" v-if="revisionModal.material?.latest_revision_id">
            Latest rev: {{ revisionModal.material.latest_revision_id }}
          </p>
          <p class="muted" v-if="revisionModal.material?.latest_revision?.changes_summary">
            {{ revisionModal.material.latest_revision.changes_summary }}
          </p>
          <label>
            Changes summary
            <textarea v-model="revisionModal.changes" rows="3" placeholder="What changed?"></textarea>
          </label>
          <p v-if="revisionModal.error" class="status status-error">{{ revisionModal.error }}</p>
        </div>
      </template>
      <template #footer>
        <button class="ghost-button" type="button" @click="closeRevisionModal">Cancel</button>
        <button class="primary" type="button" @click="handleConfirmRevision">Create revision</button>
      </template>
    </BaseModal>
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

.plate-editor-shell__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.plate-editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 7fr);
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

.timeline-panel--wide {
  width: 100%;
}

.labware-selectors {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.labware-hint {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
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
