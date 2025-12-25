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
            <p v-if="Object.keys(labwareBindings).length" class="grid-subtitle bindings-row">
              <span class="binding-chip" v-for="(val, role) in labwareBindings" :key="role">{{ role }} → {{ val }}</span>
            </p>
          </div>
          <div class="grid-actions">
            <button type="button" @click="resetSelection">Clear selection</button>
            <label v-if="labwareOptions.length" class="labware-picker">
              Active labware
              <select v-model="activeLabwareIdLocal">
                <option v-for="id in labwareOptions" :key="id" :value="id">{{ id }}</option>
              </select>
            </label>
          </div>
        </div>
        <div v-if="layoutIndex" class="grid-panel__body">
          <div class="labware-bindings">
            <p class="bindings-label">Labware bindings (role → @id)</p>
            <div class="binding-row" v-for="(val, role) in labwareBindings" :key="role">
              <input :value="role" type="text" disabled />
              <input
                v-model="bindingValueEdits[role]"
                type="text"
                @change="updateBinding(role, bindingValueEdits[role])"
              />
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="depletionMap[role] ?? guessDepletionDefault(val)"
                  @change="updateDepletion(val, $event.target.checked)"
                />
                <span>Depleting</span>
              </label>
              <button class="ghost-button tiny" type="button" @click="removeBinding(role)">Remove</button>
            </div>
            <div class="binding-row">
              <input v-model="newBindingRole" type="text" placeholder="role" />
              <input v-model="newBindingId" type="text" placeholder="labware:@id" />
              <button class="ghost-button tiny" type="button" @click="addBinding()">Add</button>
            </div>
          </div>

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
            <LabwareGrid
              :layout-index="layoutIndex"
              :wells="sourceDerivedWells"
              :selection="sourceSelection.selection"
              title="Source selection"
              :subtitle="`Use shift/cmd to multi-select · ${sourceSelection.selection.length} selected`"
              @well-click="handleSourceGridInteraction"
            />
            <LabwareGrid
              :layout-index="layoutIndex"
              :wells="targetDerivedWells"
              :selection="targetSelection.selection"
              title="Target selection"
              :subtitle="`Use shift/cmd to multi-select · ${targetSelection.selection.length} selected`"
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
              :key="evt.id || evt.timestamp"
              :class="{ 'is-active': evt.timestamp === cursor }"
            >
              <button type="button" class="event-row" @click="setCursor(evt.timestamp)">
                <span class="event-type">{{ evt.event_type || 'event' }}</span>
                <span class="event-ts">{{ formatTs(evt.timestamp) }}</span>
                <span class="event-label" v-if="evt.details?.material?.label">{{ evt.details.material.label }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Tools Section -->
      <div class="run-editor-shell__actions run-editor-shell__panel">
        <div class="apply-panel">
          <div class="labware-selectors" v-if="bindingRoles.length">
            <label>
              Source labware role
              <select v-model="sourceLabwareRole">
                <option value="reservoir">reservoir</option>
                <option v-for="role in bindingRoles" :key="`src-${role}`" :value="role">{{ role }}</option>
              </select>
            </label>
            <label>
              Target labware role
              <select v-model="targetLabwareRole">
                <option v-for="role in bindingRoles" :key="`tgt-${role}`" :value="role">{{ role }}</option>
              </select>
            </label>
          </div>
          <ApplyBar
            :roles="roleOptions"
            :materials="availableMaterials"
            :selection-count="selectionCount"
            :recent-ids="[]"
            :favorite-ids="[]"
            :features="[]"
            @apply="handleApply"
            @remove="handleRemove"
          />
        </div>
        <TransferStepSidecar
          mode="run"
          :focus-side="transferFocusSide"
          :source-selection="sourceSelection.selection"
          :target-selection="targetSelection.selection"
          :source-role="sourceLabwareRole || bindingRoles[0] || 'reservoir'"
          :target-role="targetLabwareRole || bindingRoles[0] || 'plate'"
          :source-role-options="bindingRoles"
          :target-role-options="bindingRoles"
          @update:focus-side="(side) => (transferFocusSide = side)"
          @update:source-selection="(wells) => sourceSelection.setSelection(wells)"
          @update:target-selection="(wells) => targetSelection.setSelection(wells)"
          @update:source-role="(role) => (sourceLabwareRole = role)"
          @update:target-role="(role) => (targetLabwareRole = role)"
          @create-step="handleCreateTransferStep"
        />
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
  </div>
</template>

<script setup>
import { computed, watch, ref, reactive } from 'vue'
import TimelineScrubber from '../explorer/TimelineScrubber.vue'
import ApplyBar from '../plate-editor/components/ApplyBar.vue'
import LabwareGrid from '../plate-editor/components/LabwareGrid.vue'
import TransferStepSidecar from '../plate-editor/components/TransferStepSidecar.vue'
import WellDetailsDrawer from '../explorer/WellDetailsDrawer.vue'
import { useGridSelection } from '../plate-editor/composables/useGridSelection'
import { useRunEditorStore } from './useRunEditorStore'
import { replayPlateEvents, buildLineageGraph } from '../event-graph/replay'

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
  validateRecord: {
    type: Function,
    default: null
  }
})

const store = useRunEditorStore()
const sourceLabwareRole = ref('')
const targetLabwareRole = ref('')
const newActivityLabel = ref('')
const newActivityKind = ref('protocol_segment')
const newBindingRole = ref('')
const newBindingId = ref('')
const bindingValueEdits = ref({})
const eventsExpanded = ref(false)
const drawerState = reactive({
  open: false,
  wellId: '',
  labwareId: '',
  wellState: null,
  lineage: { nodes: [], edges: [] }
})

function toggleEventsExpanded() {
  eventsExpanded.value = !eventsExpanded.value
}
function sortEventsByTimestamp(events = []) {
  return (events || [])
    .map((evt, index) => ({ evt, index }))
    .sort((a, b) => {
      const tsA = Date.parse(a.evt?.timestamp || '')
      const tsB = Date.parse(b.evt?.timestamp || '')
      const diff = (Number.isFinite(tsA) ? tsA : 0) - (Number.isFinite(tsB) ? tsB : 0)
      if (diff !== 0) return diff
      return a.index - b.index
    })
    .map((entry) => entry.evt)
}

watch(
  () => ({
    run: props.run,
    layout: props.layout,
    materialLibrary: props.materialLibrary
  }),
  (payload) => {
    store.initialize(payload)
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
  const roleId = store.resolveLabwareIdForRole(sourceLabwareRole.value)
  if (roleId) return roleId
  // Fallback: resolve the same way events do
  const ref = store.resolveLabwareRef(sourceLabwareRole.value || 'plate')
  return ref?.['@id'] || ''
})
const targetLabwareId = computed(() => {
  const roleId = store.resolveLabwareIdForRole(targetLabwareRole.value)
  if (roleId) return roleId
  // Fallback: resolve the same way events do
  const ref = store.resolveLabwareRef(targetLabwareRole.value || 'plate')
  return ref?.['@id'] || ''
})
const sourceDerivedWells = computed(() => {
  // Keep source at Now; hook for future cursor sync via state flag
  if (store.state.syncSourceToCursor) return store.getDerivedWells(sourceLabwareId.value)
  return store.getDerivedWellsAtNow(sourceLabwareId.value)
})
const targetDerivedWells = computed(() => store.getDerivedWells(targetLabwareId.value))
const activeLabwareId = computed(() => store.state.activeLabwareId || '')
const activeSelection = computed(() =>
  transferFocusSide.value === 'source' ? sourceSelection.selection.value : targetSelection.selection.value
)
const selectionCount = computed(() => activeSelection.value.length)
const canUndo = computed(() => store.state.history.length > 0)
const canRedo = computed(() => store.state.future.length > 0)
const labwareBindings = computed(() => store.state.run?.data?.labware_bindings || {})
const depletionMap = computed(() => store.state.run?.data?.labware_depletion || {})
const bindingRoles = computed(() => Object.keys(labwareBindings.value || {}))
const availableMaterials = computed(() => props.materialLibrary || [])
const roleOptions = computed(() => {
  const roles = bindingRoles.value.map((role) => ({ role, label: role }))
  if (!roles.length) {
    roles.push({ role: 'treatment', label: 'treatment' })
  }
  return roles
})
const sourceSelection = useGridSelection(layoutIndex)
const targetSelection = useGridSelection(layoutIndex)
const transferFocusSide = ref('target')
const labwareOptions = computed(() =>
  store.availableLabwareIds(activeEvents.value).length
    ? store.availableLabwareIds(activeEvents.value)
    : [activeLabwareId.value].filter(Boolean)
)
const singleSelectedWell = computed(() => (targetSelection.selection.value.length === 1 ? targetSelection.selection.value[0] : ''))
const activeLabwareIdLocal = computed({
  get() {
    return activeLabwareId.value
  },
  set(value) {
    store.setActiveLabwareId(value)
  }
})
const isInspecting = computed(() => store.isInspecting())

watch(
  () => targetLabwareRole.value,
  (role) => {
    const bound = store.resolveLabwareIdForRole(role)
    if (bound) {
      store.setActiveLabwareId(bound)
    }
  },
  { immediate: true }
)

const mappingPreview = computed(() => {
  const latest =
    activeEvents.value.find((evt) => evt && evt.timestamp === cursor.value) ||
    activeEvents.value[activeEvents.value.length - 1]
  if (!latest?.details?.mapping?.length) return []
  return latest.details.mapping.slice(0, 10)
})

const activitySummaries = computed(() =>
  (activities.value || []).map((act) => ({
    id: act.id,
    label: act.label || act.id,
    count: Array.isArray(act.plate_events) ? act.plate_events.length : 0,
    latestTs: act.plate_events?.[act.plate_events.length - 1]?.timestamp || ''
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

function resetSelection() {
  sourceSelection.reset()
  targetSelection.reset()
  store.resetSelection()
}

function setCursor(ts) {
  store.setCursor(ts)
}

function formatTs(ts = '') {
  if (!ts) return 'latest'
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
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
  const volume = step.details.volume || ''
  const sourceRef = store.resolveLabwareRef(sourceLabwareRole.value || step.details.source_role || 'reservoir')
  const targetRef = store.resolveLabwareRef(targetLabwareRole.value || step.details.target_role || 'plate')
  const timestamp = new Date().toISOString()
  const sourceWells = {}
  const targetWells = {}
  mapping.forEach((entry) => {
    if (entry.source_well) {
      sourceWells[entry.source_well] = {
        well: entry.source_well,
        volume: entry.volume || volume
      }
    }
    if (entry.target_well) {
      targetWells[entry.target_well] = {
        well: entry.target_well,
        volume: entry.volume || volume
      }
    }
  })
  store.appendEvent({
    event_type: 'transfer',
    timestamp,
    run: store.resolveRunRef(),
    labware: [sourceRef, targetRef],
    details: {
      type: 'transfer',
      label: step.label,
      notes: step.notes,
      source_role: sourceLabwareRole.value,
      target_role: targetLabwareRole.value,
      source: {
        labware: sourceRef,
        wells: sourceWells
      },
      target: {
        labware: targetRef,
        wells: targetWells
      },
      mapping,
      mapping_spec: step.details.mapping_spec,
      volume,
      material: step.details.material || null
    }
  })
}

watch(
  bindingRoles,
  (roles) => {
    if (!sourceLabwareRole.value) sourceLabwareRole.value = roles[0] || 'reservoir'
    if (!targetLabwareRole.value) targetLabwareRole.value = roles[0] || ''
  },
  { immediate: true }
)

function handleApply(payload = {}) {
  if (!payload?.materialId || !payload?.role) return
  const wells = activeSelection.value
  if (!wells.length) return
  const targetLabwareRef =
    transferFocusSide.value === 'source'
      ? store.resolveLabwareRef(sourceLabwareRole.value || 'plate')
      : store.resolveLabwareRef(targetLabwareRole.value || 'plate')
  store.applyMaterialUse({
    wells,
    material: payload.materialId,
    role: payload.role,
    amount: payload.amount,
    label: payload.materialLabel,
    controlIntents: payload.controlIntents,
    sourceLabware: sourceLabwareRole.value || 'reservoir',
    targetLabware: targetLabwareRef
  })
  if (targetLabwareRef?.['@id']) {
    store.setActiveLabwareId(targetLabwareRef['@id'])
  }
}

function handleRemove(payload = {}) {
  if (!payload?.materialId) return
  const wells = activeSelection.value
  if (!wells.length) return
  const targetLabwareRef =
    transferFocusSide.value === 'source'
      ? store.resolveLabwareRef(sourceLabwareRole.value || 'plate')
      : store.resolveLabwareRef(targetLabwareRole.value || 'plate')
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

function jumpToActivity(activityId) {
  if (!activityId) return
  activeActivityId.value = activityId
  const activity = activities.value.find((a) => a.id === activityId)
  const sorted = sortEventsByTimestamp(activity?.plate_events || [])
  const latest = sorted[sorted.length - 1]
  if (latest?.timestamp) setCursor(latest.timestamp)
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

function syncBindingEditors() {
  const entries = labwareBindings.value || {}
  const valueEdits = {}
  Object.entries(entries).forEach(([role, id]) => {
    valueEdits[role] = id
  })
  bindingValueEdits.value = valueEdits
}

function addBinding() {
  if (!newBindingRole.value || !newBindingId.value) return
  store.state.run.data ||= {}
  store.state.run.data.labware_bindings ||= {}
  store.state.run.data.labware_bindings[newBindingRole.value] = newBindingId.value
  syncBindingEditors()
  newBindingRole.value = ''
  newBindingId.value = ''
}

function updateBinding(role, value) {
  if (!role || !store.state.run?.data?.labware_bindings) return
  store.state.run.data.labware_bindings[role] = value || ''
  syncBindingEditors()
}

function updateDepletion(labwareId, checked) {
  store.setLabwareDepletion(labwareId, checked)
}

function guessDepletionDefault(labwareId = '') {
  const kind = labwareId.toLowerCase().includes('res') ? 'reservoir' : labwareId.toLowerCase().includes('tube') ? 'tube_rack' : 'plate'
  return kind === 'plate'
}

function removeBinding(role) {
  if (!role || !store.state.run?.data?.labware_bindings) return
  delete store.state.run.data.labware_bindings[role]
  syncBindingEditors()
}

function buildRunValidationPayload(run = {}) {
  const meta = run.metadata || {}
  const data = run.data || {}
  return {
    '@id': run['@id'] || meta.recordId || meta.id || '',
    kind: run.kind || 'run',
    label: meta.title || meta.label || '',
    project: meta.project || data.project || '',
    experiment: meta.experiment || data.experiment || '',
    labware_bindings: data.labware_bindings || {},
    parameters: data.parameters || {},
    activities: data.activities || []
  }
}

watch(
  () => labwareBindings.value,
  () => {
    syncBindingEditors()
  },
  { immediate: true, deep: true }
)

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
</style>
