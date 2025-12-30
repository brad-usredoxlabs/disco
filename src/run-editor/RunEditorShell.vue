<template>
  <div class="run-editor-shell">
    <header class="run-editor-shell__header">
      <div class="run-editor-shell__meta">
        <p class="run-editor-shell__title">{{ runTitle }}</p>
        <p class="run-editor-shell__subtitle">
          {{ runId }} · {{ activeActivityLabel }}
        </p>
      </div>
      <div class="run-editor-shell__controls">
        <label class="activity-select">
          Activity
          <select v-model="activeActivityId">
            <option v-for="act in activities" :key="act.id || act.label" :value="act.id">{{ act.label || act.id }}</option>
          </select>
        </label>
        <span class="run-editor-shell__badge">Run editor</span>
      </div>
    </header>

    <div v-if="validationIssues.length" class="validation-errors">
      <p class="validation-errors__title">Schema issues:</p>
      <ul>
        <li v-for="issue in validationIssues" :key="issue.path">{{ issue.path }} — {{ issue.message }}</li>
      </ul>
    </div>

    <section class="run-editor-shell__body">
      <!-- Activity Creator Row -->
      <div class="activity-create-row">
        <div class="activity-create">
          <label>
            New activity label
            <input v-model="newActivityLabel" type="text" placeholder="Dose cells" />
          </label>
          <label>
            Kind
            <select v-model="newActivityKind">
              <option value="protocol_segment">protocol_segment</option>
              <option value="acquisition">acquisition</option>
              <option value="sample_operation">sample_operation</option>
            </select>
          </label>
          <button class="ghost-button" type="button" :disabled="!newActivityLabel" @click="handleCreateActivity">
            + Add activity
          </button>
        </div>
      </div>

      <!-- Scrubber + Plates Container with Collapsible Sidebar -->
      <div class="timeline-plates-container">
        <div class="timeline-plates-main">
          <!-- Plates Grid Panel -->
          <div class="run-editor-shell__grid-panel run-editor-shell__panel">
        <div class="grid-header">
          <div>
            <p class="grid-title">Labware</p>
            <p class="grid-subtitle">Select wells to apply events; timeline cursor filters state.</p>
          </div>
          <div class="grid-actions">
            <button type="button" @click="resetSelection">Clear selection</button>
          </div>
        </div>
        <div v-if="layoutIndex" class="grid-panel__body">
          <SourceLabwarePalette
            :sources="sourcePalette"
            :active-source-id="sourceLabwareId"
            :destination="store.state.destinationPlate"
            :selected-destination-id="selectedDestinationId"
            :statuses="store.runDerivedStatus"
            @select="setActiveSource"
            @remove="archivePaletteEntryById"
            @open-template="templateForm.open = true"
            @open-run="runSourceForm.open = true"
            @change-destination-type="handleDestinationTypeChange"
          />

          <!-- Timeline Scrubber (nested below bindings) -->
          <div class="scrubber-row-nested">
            <div class="scrubber-content">
              <TimelineScrubber :events="activeEvents" :cursor="cursor" @update:cursor="setCursor" />
              <div class="scrubber-actions">
                <div class="history-actions">
                  <button type="button" :disabled="!canUndo" @click="store.undo()">Undo</button>
                  <button type="button" :disabled="!canRedo" @click="store.redo()">Redo</button>
                </div>
                <button type="button" class="sidebar-toggle" @click="toggleEventsExpanded">
                  {{ eventsExpanded ? '▼' : '▶' }} Details
                </button>
              </div>
            </div>
            <p v-if="isInspecting" class="inspection-banner">Inspecting history — new events will be added at Now.</p>
          </div>

          <div class="dual-grids">
            <div v-if="!activeSourceEntry" class="source-placeholder">
              <p class="source-placeholder__text">Add source labware using the buttons above</p>
            </div>
            <LabwareGrid
              v-else
              :layout-index="sourceLayoutIndex"
              :wells="sourceDerivedWells"
              :selection="sourceSelection.selection"
              :title="sourceGridTitle"
              :subtitle="sourceGridSubtitle"
              @well-click="handleSourceGridInteraction"
            />
            <LabwareGrid
              :layout-index="destinationLayoutIndex"
              :wells="targetDerivedWells"
              :selection="targetSelection.selection"
              :title="destinationGridTitle"
              :subtitle="destinationGridSubtitle"
              @well-click="handleTargetGridInteraction"
            />
          </div>
          <div class="grid-actions">
            <button type="button" :disabled="!singleSelectedWell" @click="openWellDrawer">View well details</button>
          </div>
        </div>
        <p v-else class="status status-muted">Layout data missing.</p>
          </div>
        </div>

        <!-- Collapsible Sidebar -->
        <div v-if="eventsExpanded" class="timeline-sidebar run-editor-shell__panel">
          <div class="sidebar-header">
            <h3 class="sidebar-title">Timeline Details</h3>
            <button type="button" class="ghost-button tiny" @click="toggleEventsExpanded">Close</button>
          </div>
          
          <div class="activity-list">
            <p class="activity-list__title">Activities</p>
            <ul>
              <li v-for="act in activitySummaries" :key="act.id">
                <button type="button" class="ghost-button tiny" @click="jumpToActivity(act.id)">
                  {{ act.label }} ({{ act.count }})
                </button>
              </li>
            </ul>
          </div>

          <div v-if="mappingPreview.length" class="mapping-preview">
            <p class="mapping-preview__title">Mapping preview</p>
            <ul>
              <li v-for="entry in mappingPreview" :key="`${entry.source_well}-${entry.target_well}`">
                {{ entry.source_well }} → {{ entry.target_well }} <span v-if="entry.volume">({{ entry.volume }})</span>
              </li>
            </ul>
          </div>

          <ul class="event-list">
            <li
              v-for="evt in activeEvents"
              :key="evt.id || getEventTimestamp(evt)"
              :class="{ 'is-active': getEventTimestamp(evt) === cursor }"
            >
              <button type="button" class="event-row" @click="setCursor(getEventTimestamp(evt))">
                <span class="event-type">{{ evt.event_type || 'event' }}</span>
                <span class="event-ts">{{ formatTs(getEventTimestamp(evt), evt.t_offset) }}</span>
                <span class="event-label" v-if="evt.details?.material_id">{{ evt.details.material_id }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Tools Section -->
      <div class="run-editor-shell__actions">
        <div class="apply-panel run-editor-shell__panel">
          <p class="selection-hint" :class="{ 'is-warning': sourceSelectionEmpty }">
            {{ sourceSelectionEmpty ? 'No source wells selected — mapping will broadcast from first source well.' : 'Source wells selected.' }}
          </p>
          <ApplyBar
            :roles="roleOptions"
            :materials="availableMaterials"
            :selection-count="selectionCount"
            :recent-ids="[]"
            :favorite-ids="[]"
            :features="featureVocab"
            :prefill-selection="applyBarPrefill"
            ontology-vocab="materials"
            @apply="handleApply"
            @remove="handleRemove"
            @request-import="handleMaterialImportRequest"
            @request-revision="handleRequestRevision"
          />
        </div>
        <div class="transfer-panel">
          <TransferStepSidecar
            mode="run"
            :focus-side="transferFocusSide"
            :source-selection="sourceSelection.selection"
            :target-selection="targetSelection.selection"
            source-role="source"
            target-role="destination"
            :source-role-options="['source']"
            :target-role-options="['destination']"
            @update:focus-side="(side) => (transferFocusSide = side)"
            @update:source-selection="(wells) => sourceSelection.setSelection(wells)"
            @update:target-selection="(wells) => targetSelection.setSelection(wells)"
            @create-step="handleCreateTransferStep"
          />
        </div>
      </div>
    </section>
<WellDetailsDrawer
  :open="drawerState.open"
  :well-id="drawerState.wellId"
  :labware-id="drawerState.labwareId"
  :well-state="drawerState.wellState"
  :lineage="drawerState.lineage"
  @close="closeWellDrawer"
/>
<AddTemplateLabwareModal :open="templateForm.open" @confirm="handleAddTemplate" @cancel="templateForm.open = false" />
<AddRunDerivedLabwareModal
  :open="runSourceForm.open"
  :runs="runsList"
  @confirm="handleAddRunSource"
  @cancel="runSourceForm.open = false"
/>
<AddMaterialToVocabModal
  :open="materialImportModal.open"
  :term="materialImportModal.term"
  :saving="materialImportModal.saving"
  :error="materialImportModal.error"
  :features="featureVocab"
  @cancel="closeMaterialImportModal"
  @save="handleMaterialImportSave"
/>
<BaseModal v-if="revisionModal.open" title="Create material revision" @close="revisionModal.open = false">
  <template #body>
    <div class="modal-form">
      <p class="status">
        Base: {{ revisionModal.material?.id }} ({{ revisionModal.material?.label }})
        <StatusTag v-if="revisionModal.material?.latest_revision_status" :status="revisionModal.material.latest_revision_status" />
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
    <button class="ghost-button" type="button" @click="revisionModal.open = false">Cancel</button>
    <button class="primary" type="button" @click="handleConfirmRevision">Create revision</button>
  </template>
</BaseModal>
</div>
</template>

<script setup>
import { computed, watch, ref, reactive, onMounted } from 'vue'
import YAML from 'yaml'
import TimelineScrubber from '../explorer/TimelineScrubber.vue'
import ApplyBar from '../plate-editor/components/ApplyBar.vue'
import LabwareGrid from '../plate-editor/components/LabwareGrid.vue'
import TransferStepSidecar from '../plate-editor/components/TransferStepSidecar.vue'
import WellDetailsDrawer from '../explorer/WellDetailsDrawer.vue'
import SourceLabwarePalette from './components/SourceLabwarePalette.vue'
import AddTemplateLabwareModal from './components/AddTemplateLabwareModal.vue'
import AddRunDerivedLabwareModal from './components/AddRunDerivedLabwareModal.vue'
import AddMaterialToVocabModal from './components/AddMaterialToVocabModal.vue'
import { useGridSelection } from '../plate-editor/composables/useGridSelection'
import { useRunEditorStore } from './useRunEditorStore'
import { replayPlateEvents, buildLineageGraph } from '../event-graph/replay'
import { resolveLayoutIndex } from '../plate-editor/utils/layoutResolver'
import { templateLayoutForKind } from './labwareTemplates'
import { useRepoConnection } from '../fs/repoConnection'
import { ensureMaterialId } from '../plate-editor/utils/materialId'
import { validateMaterialEntry } from './materialValidation'
import { writeMaterialConcept, writeMaterialRevision, rebuildMaterialsIndex } from '../vocab/materialWriter'
import BaseModal from '../ui/modal/BaseModal.vue'
import StatusTag from '../components/StatusTag.vue'

const props = defineProps({
  run: {
    type: Object,
    default: null
  },
  layout: {
    type: [Object, String],
    default: null
  },
  materialLibrary: {
    type: Array,
    default: () => []
  },
  loadRunById: {
    type: Function,
    default: null
  },
  runs: {
    type: Array,
    default: () => []
  },
  validateRecord: {
    type: Function,
    default: null
  }
})

const store = useRunEditorStore()
const repo = useRepoConnection()
const materialLibraryLocal = ref([])
const applyBarPrefill = ref(null)
const featureVocab = ref([])
const materialImportModal = reactive({
  open: false,
  term: null,
  saving: false,
  error: ''
})
const revisionModal = reactive({
  open: false,
  material: null,
  changes: '',
  error: ''
})
const newActivityLabel = ref('')
const newActivityKind = ref('protocol_segment')
const eventsExpanded = ref(false)
const drawerState = reactive({
  open: false,
  wellId: '',
  labwareId: '',
  wellState: null,
  lineage: { nodes: [], edges: [] }
})
const templateForm = reactive({
  open: false,
  label: '',
  kind: 'reservoir-1'
})
const runSourceForm = reactive({
  open: false,
  runId: '',
  labwareId: '',
  label: ''
})

async function loadFeatureVocab() {
  if (!repo?.readFile) return
  try {
    const raw = await repo.readFile('/vocab/features.yaml')
    const parsed = raw ? YAML.parse(raw) || {} : {}
    const entries = Array.isArray(parsed.features) ? parsed.features : []
    featureVocab.value = entries
      .map((f) => ({
        id: f.id,
        label: f.label || f.id
      }))
      .filter((f) => f.id)
  } catch (err) {
    featureVocab.value = []
  }
}

onMounted(() => {
  loadFeatureVocab()
})

watch(
  () => repo?.directoryHandle?.value,
  () => loadFeatureVocab()
)

function toggleEventsExpanded() {
  eventsExpanded.value = !eventsExpanded.value
}
function eventTimeMs(evt = {}) {
  const ts = evt.timestamp_actual || evt.timestamp
  const parsed = Date.parse(ts || '')
  if (Number.isFinite(parsed)) return parsed
  const offset = (evt.t_offset || '').match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
  if (offset) {
    const hours = Number(offset[1] || 0)
    const minutes = Number(offset[2] || 0)
    const seconds = Number(offset[3] || 0)
    return (hours * 3600 + minutes * 60 + seconds) * 1000
  }
  return 0
}
function sortEventsByTimestamp(events = []) {
  return (events || [])
    .map((evt, index) => ({ evt, index }))
    .sort((a, b) => {
      const tsA = eventTimeMs(a.evt)
      const tsB = eventTimeMs(b.evt)
      const diff = (Number.isFinite(tsA) ? tsA : 0) - (Number.isFinite(tsB) ? tsB : 0)
      if (diff !== 0) return diff
      return a.index - b.index
    })
    .map((entry) => entry.evt)
}

watch(
  () => [props.run, props.layout, props.materialLibrary, props.loadRunById],
  ([run, layout, materialLibrary, loadRunById]) => {
    store.initialize({ run, layout, materialLibrary, loadRunById })
  },
  { immediate: true }
)

watch(
  () => props.materialLibrary,
  (list = []) => {
    const normalized = normalizeMaterialList(list)
    materialLibraryLocal.value = normalized
    store.setMaterialLibrary(normalized)
  },
  { immediate: true, deep: true }
)

const runTitle = computed(() => {
  return props.run?.metadata?.title || props.run?.metadata?.id || 'Run'
})

const runId = computed(() => {
  return props.run?.metadata?.recordId || props.run?.metadata?.id || 'run/unknown'
})

const activities = computed(() => store.state.run?.data?.activities || [])

const activeActivityId = computed({
  get() {
    return store.state.activeActivityId
  },
  set(value) {
    store.setActiveActivityId(value)
  }
})

const activeEvents = computed(() => {
  const activity = activities.value.find((act) => act?.id === activeActivityId.value)
  return sortEventsByTimestamp(activity?.plate_events || [])
})

const cursor = computed(() => store.state.cursor)

const layoutIndex = computed(() => store.state.layoutIndex)
const sourceLabwareId = computed(() => {
  return store.state.activeSourceId || ''
})
const targetLabwareId = computed(() => {
  return store.state.destinationPlate?.id || ''
})
const sourceDerivedWells = computed(() => {
  // Keep source at Now; hook for future cursor sync via state flag
  if (store.state.syncSourceToCursor) return store.getDerivedWells(sourceLabwareId.value)
  return store.getDerivedWellsAtNow(sourceLabwareId.value)
})
const targetDerivedWells = computed(() => store.getDerivedWells(targetLabwareId.value))
const activeLabwareId = computed(() => store.state.destinationPlate?.id || '')
const activeSelection = computed(() =>
  transferFocusSide.value === 'source' ? sourceSelection.selection.value : targetSelection.selection.value
)
const selectionCount = computed(() => activeSelection.value.length)
const sourceSelectionEmpty = computed(() => !sourceSelection.selection.value.length)
const canUndo = computed(() => store.state.history.length > 0)
const canRedo = computed(() => store.state.future.length > 0)
const availableMaterials = computed(() => materialLibraryLocal.value || [])
const roleOptions = [
  'sample',
  'standard',
  'buffer',
  'media',
  'solvent',
  'treatment',
  'positive_control',
  'negative_control',
  'vehicle_control',
  'blank'
]
const sourcePalette = computed(() => (store.state.sourcePalette || []).filter((entry) => !entry.archived))
const activeSourceEntry = computed(() => store.getActiveSourceEntry())
const sourceLayoutIndex = computed(() => activeSourceEntry.value?.layoutIndex || layoutIndex.value)
const destinationLayoutIndex = computed(() => store.state.destinationPlate?.layoutIndex || layoutIndex.value)
const sourceSelection = useGridSelection(sourceLayoutIndex)
const targetSelection = useGridSelection(destinationLayoutIndex)
const transferFocusSide = ref('target')
const singleSelectedWell = computed(() => (targetSelection.selection.value.length === 1 ? targetSelection.selection.value[0] : ''))
const isInspecting = computed(() => store.isInspecting())

const mappingPreview = computed(() => {
  const latest =
    activeEvents.value.find((evt) => evt && getEventTimestamp(evt) === cursor.value) ||
    activeEvents.value[activeEvents.value.length - 1]
  if (!latest?.details?.mapping?.length) return []
  return latest.details.mapping.slice(0, 10)
})

const activitySummaries = computed(() =>
  (activities.value || []).map((act) => ({
    id: act.id,
    label: act.label || act.id,
    count: Array.isArray(act.plate_events) ? act.plate_events.length : 0,
    latestTs: getEventTimestamp(act.plate_events?.[act.plate_events.length - 1]) || ''
  }))
)

const activeActivityLabel = computed(() => {
  const activity =
    store.state.run?.data?.activities?.find((act) => act?.id === store.state.activeActivityId) ||
    store.state.run?.data?.activities?.[0]
  return activity?.label || activity?.id || 'no activity'
})

const validationIssues = computed(() => {
  if (!props.validateRecord || !store.state.run) return []
  const payload = buildRunValidationPayload(store.state.run)
  const result = props.validateRecord('run', payload)
  return result?.issues || []
})

const sourceGridTitle = computed(() => activeSourceEntry.value?.label || 'Source labware')
const sourceGridSubtitle = computed(() => {
  if (!activeSourceEntry.value) return 'Select a source to view wells.'
  const kind = activeSourceEntry.value.kind || activeSourceEntry.value.type || 'labware'
  const id = activeSourceEntry.value.labwareId || activeSourceEntry.value['@id'] || ''
  const suffix = sourceSelection.selection.value.length ? '' : ' · no source wells selected (broadcast)'
  return [kind, id].filter(Boolean).join(' · ') + suffix
})
const destinationGridTitle = computed(() => store.state.destinationPlate?.label || 'Destination plate')
const destinationGridSubtitle = computed(() => store.state.destinationPlate?.id || '')
const runsList = computed(() => props.runs || [])
const selectedDestinationId = computed(() => store.state.selectedDestinationId || store.state.destinationPlate?.id || '')

function normalizeVolumeInput(volume, defaultUnit = 'uL') {
  if (!volume) return null
  if (typeof volume === 'object' && volume.value !== undefined && volume.unit) {
    return { value: Number(volume.value), unit: volume.unit }
  }
  if (typeof volume === 'string') {
    const match = volume.trim().match(/^([\d.]+)\s*([a-zA-Z]+)$/)
    if (match) return { value: Number(match[1]), unit: match[2] }
  }
  if (typeof volume === 'number') return { value: volume, unit: defaultUnit }
  return null
}

function buildMapping(sourceWells = [], targetWells = [], volume = '') {
  if (!Array.isArray(sourceWells)) sourceWells = []
  if (!Array.isArray(targetWells)) targetWells = []
  if (!targetWells.length) return []
  // If no source wells selected, let store fallback to virtual/material behavior
  if (!sourceWells.length) return []
  const normalizedVolume = normalizeVolumeInput(volume)
  const mapping = []
  if (sourceWells.length === 1) {
    const src = sourceWells[0]
    targetWells.forEach((tgt) => {
      mapping.push({ source_well: src, target_well: tgt, volume: normalizedVolume })
    })
    return mapping
  }
  const n = Math.min(sourceWells.length, targetWells.length)
  for (let i = 0; i < n; i += 1) {
    mapping.push({ source_well: sourceWells[i], target_well: targetWells[i], volume: normalizedVolume })
  }
  return mapping
}

function handleAddTemplate(payload = {}) {
  const kind = payload.kind || templateForm.kind || 'plate96'
  const label = (payload.label || templateForm.label || kind).trim()
  const layoutIndex = templateLayoutForKind(kind)
  const entry = store.addTemplatePaletteEntry({
    kind,
    label,
    layoutIndex
  })
  if (entry?.labwareId) {
    store.setActiveSourceId(entry.labwareId)
  }
  templateForm.label = ''
  templateForm.open = false
}

async function handleAddRunSource(payload = {}) {
  const runId = payload.runId || runSourceForm.runId
  if (!runId) return
  let labwareId = payload.labwareId || runSourceForm.labwareId
  const label = payload.label || runSourceForm.label
  let layoutIndex = resolveLayoutIndex({}, { fallbackKind: 'plate96' })
  if (!labwareId && typeof props.loadRunById === 'function') {
    try {
      const runRecord = await props.loadRunById(runId)
      const firstInstance = runRecord?.data?.labware_instances?.[0]
      if (firstInstance) {
        labwareId = firstInstance['@id'] || labwareId
        layoutIndex = resolveLayoutIndex(firstInstance.layout || { kind: firstInstance.kind || 'plate96' }, { fallbackKind: firstInstance.kind || 'plate96' })
      }
      const fallbackId = runRecord?.metadata?.id || runRecord?.metadata?.recordId
      if (!labwareId) labwareId = fallbackId ? `plate/${fallbackId}` : `plate/${runId}`
    } catch (err) {
      labwareId = labwareId || `plate/${runId}`
    }
  }
  if (!labwareId) return
  store.addRunDerivedPaletteEntry({
    runId,
    labwareId,
    label: label || labwareId,
    layoutIndex
  })
  runSourceForm.open = false
  runSourceForm.runId = ''
  runSourceForm.labwareId = ''
  runSourceForm.label = ''
}

function handleMaterialImportRequest(payload = {}) {
  const term = payload.normalized || payload.term || {}
  const label = term.label || term.prefLabel || term.id || term.identifier || term['@id'] || ''
  const id = term.id || term.identifier || term['@id'] || label
  materialImportModal.term = {
    ...term,
    label,
    id
  }
  materialImportModal.error = ''
  materialImportModal.open = true
}

function closeMaterialImportModal() {
  materialImportModal.open = false
  materialImportModal.term = null
  materialImportModal.error = ''
  materialImportModal.saving = false
}

async function handleMaterialImportSave(entry = {}) {
  if (!entry?.id || !entry?.label) {
    materialImportModal.error = 'ID and label are required.'
    return
  }
  const validation = validateMaterialEntry(entry, featureVocab.value)
  if (!validation.ok) {
    materialImportModal.error = validation.errors.join(' | ')
    return
  }
  materialImportModal.saving = true
  materialImportModal.error = ''
  try {
    const saved = await writeMaterialConceptAndRevision(entry)
    upsertLocalMaterial(saved.revision || entry)
    closeMaterialImportModal()
  } catch (err) {
    materialImportModal.error = err?.message || 'Failed to save material.'
  } finally {
    materialImportModal.saving = false
  }
}

function handleRequestRevision(material = {}) {
  if (!material?.id) return
  revisionModal.material = material
  revisionModal.changes = ''
  revisionModal.open = true
}

async function handleConfirmRevision() {
  const material = revisionModal.material
  if (!material?.id) return
  const baseRevision = material.latest_revision || {}
  const changes = revisionModal.changes?.trim()
  if (!changes) {
    revisionModal.error = 'Changes summary is required for a new revision.'
    return
  }
  try {
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
    const { revision } = await writeMaterialRevision(repo, payload, { createdBy: 'user' })
    await rebuildMaterialsIndex(repo)
    const index = materialLibraryLocal.value.findIndex((m) => m.id === material.id)
    if (index >= 0) {
      materialLibraryLocal.value[index] = {
        ...materialLibraryLocal.value[index],
        latest_revision_id: revision.id,
        latest_revision_status: revision.status,
        latest_revision: revision
      }
      materialLibraryLocal.value = [...materialLibraryLocal.value]
      store.setMaterialLibrary(materialLibraryLocal.value)
    }
    applyBarPrefill.value = {
      ...material,
      latest_revision_id: revision.id,
      latest_revision_status: revision.status,
      latest_revision: revision,
      material_revision: revision.id
    }
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

function setActiveSource(labwareId) {
  store.setActiveSourceId(labwareId)
}

function archivePaletteEntryById(labwareId) {
  store.archivePaletteEntry(labwareId)
}

function handleDestinationChange(labwareId) {
  if (!labwareId) return
  store.setDestination(labwareId)
}

function handleDestinationTypeChange(plateType) {
  if (!plateType) return
  store.setDestinationType(plateType)
}

function resetSelection() {
  sourceSelection.reset()
  targetSelection.reset()
  store.resetSelection()
}

function setCursor(ts) {
  store.setCursor(ts)
}

function getEventTimestamp(evt = {}) {
  return evt.timestamp_actual || evt.timestamp || ''
}

function formatTs(ts = '', offset = '') {
  if (!ts && offset) return offset
  if (!ts) return 'latest'
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return offset || ts
  return date.toLocaleString()
}

function handleCreateActivity() {
  if (!newActivityLabel.value) return
  const activity = store.addActivity({
    label: newActivityLabel.value,
    kind: newActivityKind.value
  })
  if (activity) {
    activeActivityId.value = activity.id
    newActivityLabel.value = ''
  }
}

function handleSourceGridInteraction(payload = {}) {
  if (!payload?.wellId) return
  const isShift = payload.event?.shiftKey
  const isMeta = payload.event?.metaKey || payload.event?.ctrlKey
  if (isShift) {
    sourceSelection.rangeSelect(payload.wellId)
  } else if (isMeta) {
    sourceSelection.toggleSelection(payload.wellId)
  } else {
    sourceSelection.selectSingle(payload.wellId)
  }
  transferFocusSide.value = 'source'
  store.setSelection(sourceSelection.selection.value, sourceSelection.anchor.value)
}

function handleTargetGridInteraction(payload = {}) {
  if (!payload?.wellId) return
  const isShift = payload.event?.shiftKey
  const isMeta = payload.event?.metaKey || payload.event?.ctrlKey
  if (isShift) {
    targetSelection.rangeSelect(payload.wellId)
  } else if (isMeta) {
    targetSelection.toggleSelection(payload.wellId)
  } else {
    targetSelection.selectSingle(payload.wellId)
  }
  transferFocusSide.value = 'target'
  // Keep primary selection in sync for ApplyBar overlays
  store.setSelection(targetSelection.selection.value, targetSelection.anchor.value)
}

function handleCreateTransferStep(step = {}) {
  if (!step?.details?.mapping?.length) return
  const mapping = step.details.mapping
  const volume = normalizeVolumeInput(step.details.volume || '')
  const sourceRef = store.resolveSourceLabwareRef()
  const targetRef = store.resolveDestinationLabwareRef()
  const normalizedMapping = mapping.map((entry) => ({
    ...entry,
    volume: normalizeVolumeInput(entry.volume || volume)
  }))
  const volumes = normalizedMapping.map((m) => m.volume).filter(Boolean)
  let uniformVolume = null
  if (volumes.length) {
    const first = volumes[0]
    const allSame = volumes.every((v) => Number(v.value) === Number(first.value) && String(v.unit).toLowerCase() === String(first.unit).toLowerCase())
    if (allSame) uniformVolume = first
  } else if (volume) {
    uniformVolume = volume
  }
  const finalMapping =
    uniformVolume && volumes.length
      ? normalizedMapping.map((m) => {
          const copy = { ...m }
          if (copy.volume && Number(copy.volume.value) === Number(uniformVolume.value) && String(copy.volume.unit).toLowerCase() === String(uniformVolume.unit).toLowerCase()) {
            delete copy.volume
          }
          return copy
        })
      : normalizedMapping
  const mappingSpec = step.details.mapping_spec
    ? { ...step.details.mapping_spec, target_wells: finalMapping.map((m) => m.target_well).filter(Boolean) }
    : null
  store.appendEvent({
    event_type: 'transfer',
    details: {
      type: 'transfer',
      label: step.label,
      notes: step.notes,
      source_labware: sourceRef?.['@id'] || sourceRef,
      target_labware: targetRef?.['@id'] || targetRef,
      mapping: finalMapping,
      ...(mappingSpec ? { mapping_spec: mappingSpec } : {}),
      volume: uniformVolume,
      material_id: step.details.material_id || step.details.material?.id || null
    }
  })
}

function handleApply(payload = {}) {
  if (!payload?.materialId || !payload?.role) return
  const material = availableMaterials.value.find((m) => m.id === payload.materialId) || {}
  const revisionId =
    payload.materialRevision ||
    payload.material_revision ||
    material.material_revision ||
    material.latest_revision_id ||
    ''
  const applyingToSource = transferFocusSide.value === 'source'
  const targetWells = applyingToSource
    ? sourceSelection.selection.value
    : targetSelection.selection.value.length
      ? targetSelection.selection.value
      : activeSelection.value
  if (!targetWells.length) return
  if (applyingToSource) {
    const sourceLabwareRef = store.resolveSourceLabwareRef()
    store.appendEvent({
      event_type: 'add_material',
      details: {
        type: 'add_material',
        target_labware: sourceLabwareRef?.['@id'] || sourceLabwareRef,
        wells: targetWells,
        material_id: payload.materialId,
        material_revision: revisionId || null,
        stock_concentration: payload.concentration || null,
        volume: normalizeVolumeInput(payload.volume),
        role: payload.role || 'component',
        control_intents: payload.controlIntents || []
      }
    })
  } else {
    const sourceWells = sourceSelection.selection.value
    const sourceLabwareRef = {
      '@id': `virtual/${store.state.activeSourceId || 'source'}`,
      kind: 'virtual',
      label: 'virtual source'
    }
    const targetLabwareRef = store.resolveDestinationLabwareRef()
    const mapping = buildMapping(sourceWells, targetWells, payload.volume)
    store.applyMaterialUse({
      wells: targetWells,
      mapping,
      material: payload.materialId,
      material_revision: revisionId || null,
      role: payload.role,
      volume: payload.volume,
      concentration: payload.concentration,
      label: payload.materialLabel,
      controlIntents: payload.controlIntents,
      sourceLabware: sourceLabwareRef,
      targetLabware: targetLabwareRef
    })
    if (targetLabwareRef?.['@id']) {
      store.setActiveLabwareId(targetLabwareRef['@id'])
    }
  }
}

function handleRemove(payload = {}) {
  if (!payload?.materialId) return
  const removingFromSource = transferFocusSide.value === 'source'
  const wells = removingFromSource
    ? sourceSelection.selection.value
    : targetSelection.selection.value.length
      ? targetSelection.selection.value
      : activeSelection.value
  if (!wells.length) return
  const targetLabwareRef = removingFromSource ? store.resolveSourceLabwareRef() : store.resolveDestinationLabwareRef()
  store.removeMaterialUse({
    wells,
    material: payload.materialId,
    role: payload.role,
    targetLabware: targetLabwareRef
  })
  if (targetLabwareRef?.['@id']) {
    store.setActiveLabwareId(targetLabwareRef['@id'])
  }
}

// Legacy writer removed: rely on concept/revision files + index
async function writeMaterialToVocab(entry = {}) {
  return entry
}

function upsertLocalMaterial(entry = {}) {
  const normalized = normalizeMaterialEntry(entry)
  if (!normalized) throw new Error('Material entry missing label or id.')
  const index = materialLibraryLocal.value.findIndex((item) => item.id === normalized.id)
  if (index >= 0) {
    materialLibraryLocal.value.splice(index, 1, normalized)
  } else {
    materialLibraryLocal.value.push(normalized)
  }
  materialLibraryLocal.value = [...materialLibraryLocal.value]
  store.setMaterialLibrary(materialLibraryLocal.value)
  applyBarPrefill.value = { id: normalized.id }
}

function normalizeMaterialList(list = []) {
  if (!Array.isArray(list)) return []
  return list.map((entry) => normalizeMaterialEntry(entry)).filter(Boolean)
}

function normalizeMaterialEntry(entry = {}) {
  const label = (entry.label || entry.id || '').trim()
  if (!label) return null
  const id = ensureMaterialId(entry.id || label)
  const tags = dedupeStrings(entry.tags || [])
  const experimentalIntents = dedupeStrings(entry.experimental_intents || entry.intents || [], {
    preserveCase: true
  })
  const synonyms = dedupeStrings(entry.synonyms || [], { preserveCase: true })
  const xrefTokens = buildXrefTokens(entry.xref)
  const defaults = normalizeDefaults(entry.defaults)
  const normalized = {
    ...entry,
    id,
    label,
    category: entry.category || 'other',
    experimental_intents: experimentalIntents,
    tags,
    synonyms,
    defaults
  }
  normalized.searchTokens = buildSearchTokens({
    id,
    label,
    tags,
    synonyms,
    intents: experimentalIntents,
    category: entry.category || 'other',
    measures: ensureArray(entry.measures),
    controlFeatures: ensureArray(entry.control_for?.features),
    xrefTokens
  })
  return normalized
}

async function writeMaterialConceptAndRevision(entry = {}) {
  const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z')
  const conceptResult = await writeMaterialConcept(repo, entry, { timestamp })
  const revisionResult = await writeMaterialRevision(repo, entry, { timestamp, createdBy: 'user' })
  // Optionally keep legacy file updated if present
  await writeMaterialToVocab(entry)
  await rebuildMaterialsIndex(repo)
  return { concept: conceptResult.concept, revision: revisionResult.revision }
}

function normalizeDefaults(defaults = {}) {
  if (!defaults || typeof defaults !== 'object') return {}
  const normalized = {}
  if (defaults.role) normalized.role = defaults.role
  const addVolume = normalizeAmount(defaults.add_volume || defaults.amount)
  if (addVolume) normalized.add_volume = addVolume
  const working = normalizeAmount(defaults.working_concentration || defaults.concentration)
  if (working) normalized.working_concentration = working
  const stock = normalizeAmount(defaults.stock_concentration)
  if (stock) normalized.stock_concentration = stock
  return normalized
}

function normalizeAmount(amount = {}) {
  if (amount === null || amount === undefined) return null
  if (typeof amount === 'number') return null
  const value = Number(amount.value)
  const unit = typeof amount.unit === 'string' ? amount.unit.trim() : ''
  if (!Number.isFinite(value) || !unit) return null
  return { value, unit }
}

function buildXrefTokens(xref = {}) {
  if (!xref || typeof xref !== 'object') return []
  return Object.values(xref)
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean)
}

function buildSearchTokens({
  id,
  label,
  tags = [],
  synonyms = [],
  intents = [],
  category = '',
  measures = [],
  controlFeatures = [],
  xrefTokens = []
}) {
  const bucket = new Set()
  ;[
    id,
    label,
    category,
    ...tags,
    ...synonyms,
    ...intents,
    ...measures,
    ...controlFeatures,
    ...xrefTokens
  ]
    .map((token) => (typeof token === 'string' ? token.trim().toLowerCase() : ''))
    .filter(Boolean)
    .forEach((token) => bucket.add(token))
  return Array.from(bucket)
}

function dedupeStrings(list = [], options = {}) {
  if (!Array.isArray(list)) return []
  const preserveCase = Boolean(options.preserveCase)
  const seen = new Set()
  const bucket = []
  list.forEach((value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    const token = trimmed.toLowerCase()
    if (seen.has(token)) return
    seen.add(token)
    bucket.push(preserveCase ? trimmed : trimmed.toLowerCase())
  })
  return bucket
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function ensureSequence(doc) {
  if (doc.contents && doc.contents.type === 'SEQ') return
  const seq = doc.createNode([])
  seq.flow = false
  doc.contents = seq
}

function hashString(value = '') {
  let hash = 0
  const str = String(value || '')
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return (`00000000${(hash >>> 0).toString(16)}`).slice(-8)
}

function extractCurieFromIri(iri = '') {
  if (!iri) return ''
  const input = String(iri)
  const oboMatch = input.match(/\/obo\/([A-Za-z]+)_([0-9]+)/)
  if (oboMatch) {
    return `${oboMatch[1].toUpperCase()}:${oboMatch[2]}`
  }
  const ncitMatch = input.match(/Thesaurus\.owl#C(\d+)/i)
  if (ncitMatch) {
    return `NCIT:C${ncitMatch[1]}`
  }
  return ''
}

function canonicalizeMaterialEntry(entry = {}) {
  const next = { ...entry }
  const aliases = {}
  const xrefValues = entry.xref && typeof entry.xref === 'object' ? Object.values(entry.xref).filter(Boolean) : []
  let inferredCurie = ''
  let inferredIri = ''
  for (const val of xrefValues) {
    const curie = extractCurieFromIri(val)
    if (curie) {
      inferredCurie = curie
      inferredIri = inferredIri || val
      break
    }
  }
  if (!inferredCurie) {
    inferredCurie = extractCurieFromIri(entry.id)
  }
  if (!inferredIri && typeof entry.id === 'string' && entry.id.startsWith('http')) {
    inferredIri = entry.id
  }

  let canonicalId = entry.id || ''
  const shouldCanonicalize = /^material:http/i.test(canonicalId) || /^http/i.test(canonicalId)
  if (shouldCanonicalize) {
    if (inferredCurie) {
      const [prefix, code] = inferredCurie.split(':')
      canonicalId = `material:${prefix.toLowerCase()}:${code}`
    } else {
      canonicalId = `material:ext:${hashString(entry.id || entry.label || 'material')}`
    }
    if (entry.id && entry.id !== canonicalId) {
      aliases[entry.id] = canonicalId
    }
  }
  next.id = canonicalId

  const xrefs = Array.isArray(entry.xrefs) ? [...entry.xrefs] : []
  if (inferredCurie && !xrefs.some((x) => x.curie === inferredCurie)) {
    xrefs.push({ curie: inferredCurie })
  }
  if (inferredIri && !xrefs.some((x) => x.iri === inferredIri)) {
    xrefs.push({ iri: inferredIri })
  }
  next.xrefs = xrefs
  return { entry: next, aliases }
}

function findNodeIndex(seq, id) {
  if (!seq?.items?.length) return -1
  return seq.items.findIndex((node) => readScalar(node, 'id') === id)
}

function readScalar(node, key) {
  if (!node?.items) return undefined
  const pair = node.items.find((item) => item?.key?.value === key)
  if (!pair) return undefined
  return pair.value?.value
}

function jumpToActivity(activityId) {
  if (!activityId) return
  activeActivityId.value = activityId
  const activity = activities.value.find((a) => a.id === activityId)
  const sorted = sortEventsByTimestamp(activity?.plate_events || [])
  const latest = sorted[sorted.length - 1]
  const ts = getEventTimestamp(latest)
  if (ts) setCursor(ts)
}

function openWellDrawer() {
  if (!singleSelectedWell.value) return
  const replay = replayPlateEvents(activeEvents.value, {
    depletionDefaults: {
      plate: true,
      reservoir: false,
      tube_rack: false
    }
  })
  const wellState = replay.state?.[activeLabwareId.value]?.[singleSelectedWell.value] || null
  const lineage = buildLineageGraph(replay.edges || [])
  drawerState.open = true
  drawerState.wellId = singleSelectedWell.value
  drawerState.labwareId = activeLabwareId.value
  drawerState.wellState = wellState
  drawerState.lineage = lineage
}

function closeWellDrawer() {
  drawerState.open = false
}

function buildRunValidationPayload(run = {}) {
  const meta = run.metadata || {}
  const data = run.data || {}
  return {
    '@id': run['@id'] || meta.recordId || meta.id || '',
    kind: run.kind || 'run',
    label: meta.title || meta.label || '',
    study: meta.study || data.study || '',
    experiment: meta.experiment || data.experiment || '',
    labware_bindings: data.labware_bindings || {},
    labware_instances: data.labware_instances || [],
    source_palette: Array.isArray(data.source_palette) && data.source_palette.length
      ? data.source_palette
      : store.derivePaletteData(),
    parameters: data.parameters || {},
    activities: data.activities || []
  }
}

defineExpose({
  store
})
</script>

<style scoped>
.run-editor-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.run-editor-shell__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.run-editor-shell__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.run-editor-shell__title {
  margin: 0;
  font-weight: 600;
  font-size: 18px;
}

.run-editor-shell__subtitle {
  margin: 0;
  color: #666;
  font-size: 13px;
}

.run-editor-shell__badge {
  display: inline-block;
  padding: 4px 8px;
  background: #eef2ff;
  color: #3b4cca;
  border-radius: 6px;
  font-size: 12px;
}

.run-editor-shell__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-create-row {
  width: 100%;
}

.activity-create {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.run-editor-shell__panel {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}

.timeline-plates-container {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: start;
}

.timeline-plates-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.scrubber-row {
  padding: 8px 12px;
}

.scrubber-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.scrubber-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebar-toggle {
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.sidebar-toggle:hover {
  background: #f8fafc;
}

.timeline-sidebar {
  width: 320px;
  max-height: 600px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.grid-header,
.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.inspection-banner {
  margin: 4px 0 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #0f172a;
  font-size: 12px;
}

.grid-title,
.timeline-title {
  margin: 0;
  font-weight: 700;
}

.grid-subtitle,
.timeline-subtitle {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.bindings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.binding-chip {
  padding: 2px 6px;
  background: #f1f5f9;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  color: #334155;
}

.grid-actions {
  display: flex;
  gap: 8px;
}

.labware-picker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.grid-panel__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.palette-row {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 12px;
  align-items: start;
}
.palette-panel {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.palette-title {
  margin: 0;
  font-weight: 700;
  font-size: 13px;
}
.palette-actions {
  display: flex;
  gap: 6px;
}
.palette-form {
  display: grid;
  gap: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px;
}
.palette-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.palette-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}
.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}
.palette-item__label {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
}
.palette-item__text {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 2px;
}
.palette-item__meta {
  color: #64748b;
  font-size: 12px;
}
.palette-item__meta .error {
  color: #b91c1c;
}
.palette-empty {
  font-size: 13px;
  color: #64748b;
}
.destination-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}
.palette-destination__label {
  margin: 0;
  font-weight: 600;
}
.palette-destination__meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: #64748b;
}

.dual-grids {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
}

.run-editor-shell__actions {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.apply-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.labware-selectors {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.labware-selectors label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.selection-hint {
  margin: 0 0 6px;
  font-size: 12px;
  color: #475569;
}
.selection-hint.is-warning {
  color: #b45309;
}

.run-editor-shell__controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.activity-select {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.event-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow: auto;
}

.event-row {
  width: 100%;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 6px;
  padding: 6px 8px;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  cursor: pointer;
}

.event-list .is-active .event-row {
  border-color: #3b4cca;
  background: #eef2ff;
}

.legend-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 6px 0;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
}

.legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
}

.legend-swatch--event {
  background: rgba(59, 76, 202, 0.12);
  border-color: #3b4cca;
}

.mapping-preview {
  margin: 6px 0;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.mapping-preview__title {
  margin: 0 0 4px;
  font-weight: 600;
  font-size: 12px;
}

.mapping-preview ul {
  margin: 0;
  padding-left: 16px;
  color: #475569;
  font-size: 12px;
}

.activity-list {
  margin: 8px 0;
}

.activity-list__title {
  margin: 0 0 4px;
  font-weight: 600;
  font-size: 12px;
}

.activity-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.event-type {
  font-weight: 600;
  text-transform: capitalize;
}

.event-ts {
  color: #475569;
  font-size: 12px;
  justify-self: end;
}

.event-label {
  color: #0f172a;
  font-size: 12px;
  justify-self: end;
}

.history-actions {
  display: flex;
  gap: 6px;
}

.labware-bindings {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 8px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scrubber-row-nested {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 8px;
  border-radius: 6px;
}

.bindings-label {
  margin: 0;
  font-weight: 600;
  font-size: 12px;
}

.binding-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 8px;
  align-items: center;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.validation-errors {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #9f1239;
  padding: 8px;
  border-radius: 6px;
  margin: 0 0 8px;
}

.validation-errors__title {
  margin: 0 0 4px;
  font-weight: 700;
  font-size: 13px;
}

.validation-errors ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
}

.source-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
  color: #94a3b8;
}

.source-placeholder__text {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}
</style>
