<script setup>
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { parseFrontMatter, serializeFrontMatter } from '../records/frontMatter'
import { useGridSelection } from '../plate-editor/composables/useGridSelection'
import TransferStepSidecar from '../plate-editor/components/TransferStepSidecar.vue'
import LabwareGrid from '../plate-editor/components/LabwareGrid.vue'
import { resolveLayoutFromRole } from '../plate-editor/utils/layoutResolver'
import { useMaterialLibrary } from '../plate-editor/composables/useMaterialLibrary'
import MaterialPicker from '../plate-editor/components/MaterialPicker.vue'

const LABWARE_KINDS = ['plate', 'reservoir', 'tube_rack', 'tip_rack', 'trash', 'other']
const DEFAULT_EVENT_TYPES = ['transfer', 'incubate', 'read', 'wash', 'other']

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
const saving = ref(false)
const error = ref('')
const status = ref('')
const activeTab = ref('info')
const selectedEventIndex = ref(0)
const frontMatterRef = ref({ metadata: {}, data: {} })
const bodyRef = ref('')
const protocolState = reactive({
  metadata: {},
  labwareRoles: [],
  events: []
})
const originalHash = ref('')

const tabs = [
  { id: 'info', label: 'Info' },
  { id: 'labware', label: 'Labware roles' },
  { id: 'events', label: 'Events' },
  { id: 'preview', label: 'Preview' }
]

const currentHash = computed(() => JSON.stringify(buildDataSnapshot()))
const isDirty = computed(() => !!originalHash.value && currentHash.value !== originalHash.value)
const selectedEvent = computed(() => protocolState.events[selectedEventIndex.value] || null)
const previewEvents = computed(() => protocolState.events.map((event, index) => formatEventSummary(event, index)))
const parameterNames = computed(() => Object.keys(frontMatterRef.value?.data?.parametersSchema?.properties || {}))
const labwareRoleNames = computed(() => protocolState.labwareRoles.map((role) => role.name).filter(Boolean))
const availableMaterials = computed(() => materialLibrary.entries.value || [])
const sourceRole = ref('')
const targetRole = ref('')
const sourceLayoutIndex = computed(() =>
  resolveLayoutFromRole(findLabwareRole(sourceRole.value) || {}, { fallbackKind: 'plate96' })
)
const targetLayoutIndex = computed(() =>
  resolveLayoutFromRole(findLabwareRole(targetRole.value) || {}, { fallbackKind: 'plate96' })
)
const sourceSelection = useGridSelection(sourceLayoutIndex)
const targetSelection = useGridSelection(targetLayoutIndex)
const transferFocusSide = ref('target')
const materialLibrary = useMaterialLibrary(props.repo)
let roleIdCounter = 0

watch(
  () => props.recordPath,
  (next) => {
    if (next && props.repo?.directoryHandle?.value) {
      loadRecord()
    }
  },
  { immediate: true }
)

watch(
  () => props.repo.directoryHandle.value,
  (handle) => {
    if (handle && props.recordPath) {
      loadRecord()
    }
  }
)

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

function handleBeforeUnload(event) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

async function loadRecord() {
  if (!props.recordPath) return
  loading.value = true
  error.value = ''
  status.value = ''
  try {
    const raw = await props.repo.readFile(props.recordPath)
    const { data, body } = parseFrontMatter(raw)
    frontMatterRef.value = data || { metadata: {}, data: {} }
    bodyRef.value = body || ''
    hydrateProtocolState(frontMatterRef.value)
    originalHash.value = currentHash.value
  } catch (err) {
    error.value = err?.message || 'Unable to load protocol.'
  } finally {
    loading.value = false
  }
}

function hydrateProtocolState(frontMatter = {}) {
  protocolState.metadata = cloneValue(frontMatter.metadata || {})
  protocolState.labwareRoles = buildLabwareRoleList(frontMatter.data?.labwareRoles || {})
  protocolState.events = buildEventList(frontMatter.data?.events || [])
  selectedEventIndex.value = protocolState.events.length ? 0 : -1
  initializeTransferRoles()
  sourceSelection.reset()
  targetSelection.reset()
}

function buildLabwareRoleList(source = {}) {
  return Object.entries(source).map(([name, role]) => ({
    id: role?.id || generateRoleId(name || 'role'),
    name,
    kind: role?.kind || 'plate',
    plate_type: role?.plate_type || '',
    description: role?.description || '',
    default_labware_id: role?.default_labware_id || '',
    layout: role?.layout || null
  }))
}

function buildEventList(events = []) {
  return events.map((entry, index) => ({
    id: entry?.id || `evt-${index + 1}`,
    phase: entry?.phase || '',
    event_type: entry?.event_type || 'transfer',
    label: entry?.label || `Step ${index + 1}`,
    notes: entry?.notes || '',
    details: ensureDetailsByType(entry?.event_type || 'transfer', entry?.details)
  }))
}

function addLabwareRole() {
  protocolState.labwareRoles = [
    ...protocolState.labwareRoles,
    {
      id: generateRoleId('role'),
      name: `role_${protocolState.labwareRoles.length + 1}`,
      kind: 'plate',
      plate_type: '',
      description: '',
      default_labware_id: '',
      layout: null
    }
  ]
  status.value = ''
}

function removeLabwareRole(index) {
  protocolState.labwareRoles = protocolState.labwareRoles.filter((_, idx) => idx !== index)
  status.value = ''
}

function addEvent() {
  const nextIndex = protocolState.events.length + 1
  protocolState.events = [
    ...protocolState.events,
    {
      id: `evt-${nextIndex}`,
      phase: '',
      event_type: 'transfer',
      label: `Step ${nextIndex}`,
      notes: '',
      details: ensureDetailsByType('transfer')
    }
  ]
  selectedEventIndex.value = protocolState.events.length - 1
  status.value = ''
}

function removeEvent(index) {
  protocolState.events = protocolState.events.filter((_, idx) => idx !== index)
  if (selectedEventIndex.value >= protocolState.events.length) {
    selectedEventIndex.value = protocolState.events.length - 1
  }
  status.value = ''
}

function moveEvent(index, direction) {
  const target = index + direction
  if (target < 0 || target >= protocolState.events.length) return
  const copy = [...protocolState.events]
  const [entry] = copy.splice(index, 1)
  copy.splice(target, 0, entry)
  protocolState.events = copy
  selectedEventIndex.value = target
}

function handleTransferFocusSide(side) {
  transferFocusSide.value = side === 'source' ? 'source' : 'target'
  syncStoreSelection()
}

function handleSourceSelectionUpdate(wells = []) {
  sourceSelection.setSelection(wells || [])
  if (transferFocusSide.value === 'source') {
    syncStoreSelection()
  }
}

function handleTargetSelectionUpdate(wells = []) {
  targetSelection.setSelection(wells || [])
  if (transferFocusSide.value === 'target') {
    syncStoreSelection()
  }
}

function syncStoreSelection() {
  // Keep the selected event selection context in the UI; no store-backed grid here, so noop placeholder.
}

function handleGridInteraction(side, payload) {
  const wellId = payload?.wellId
  const event = payload?.event
  if (!wellId) return
  const selectionApi = side === 'source' ? sourceSelection : targetSelection
  if (event?.shiftKey) {
    selectionApi.rangeSelect(wellId)
  } else if (event?.metaKey || event?.ctrlKey) {
    selectionApi.toggleSelection(wellId)
  } else {
    selectionApi.selectSingle(wellId)
  }
}

function handleMaterialSelect(selection = {}) {
  if (!selectedEvent.value || selectedEvent.value.event_type !== 'transfer') return
  if (!selection?.id) return
  selectedEvent.value.details.material = selection.id
  const rev = selection.material_revision || selection.latest_revision_id || ''
  selectedEvent.value.details.material_revision = rev
}

function selectEvent(index) {
  selectedEventIndex.value = index
}

function buildDataSnapshot() {
  return {
    metadata: protocolState.metadata,
    labwareRoles: labwareRoleMap(protocolState.labwareRoles),
    events: protocolState.events.map((event) => ({
      id: event.id,
      phase: event.phase,
      event_type: event.event_type,
      label: event.label,
      notes: event.notes,
      details: event.details
    }))
  }
}

function labwareRoleMap(list = []) {
  const map = {}
  list.forEach((role) => {
    if (!role?.name) return
    map[role.name] = {
      kind: role.kind || 'plate',
      plate_type: role.plate_type || '',
      description: role.description || '',
      default_labware_id: role.default_labware_id || '',
      layout: role.layout || null
    }
  })
  return map
}

function findLabwareRole(name) {
  if (!name) return null
  return protocolState.labwareRoles.find((role) => role.name === name) || null
}

function initializeTransferRoles() {
  const roles = labwareRoleNames.value
  sourceRole.value = roles[0] || ''
  targetRole.value = roles[1] || roles[0] || ''
}

function generateRoleId(prefix = 'role') {
  roleIdCounter += 1
  return `${prefix}-${Date.now()}-${roleIdCounter}`
}

  function buildSavePayload() {
    const frontMatter = cloneValue(frontMatterRef.value)
    frontMatter.metadata = cloneValue(protocolState.metadata)
    frontMatter.data = frontMatter.data || {}
    frontMatter.data.labwareRoles = labwareRoleMap(protocolState.labwareRoles)
    frontMatter.data.events = protocolState.events.map((event) => ({
      id: event.id,
      phase: event.phase,
      event_type: event.event_type,
    label: event.label,
    notes: event.notes,
    details: cloneValue(event.details || {})
  }))
  return frontMatter
}

async function handleSave() {
  if (!props.recordPath || !isDirty.value) return
  saving.value = true
  error.value = ''
  try {
    const payload = buildSavePayload()
    const serialized = serializeFrontMatter(payload, bodyRef.value || '')
    await props.repo.writeFile(props.recordPath, serialized)
    frontMatterRef.value = payload
    originalHash.value = currentHash.value
    status.value = 'Saved changes'
  } catch (err) {
    error.value = err?.message || 'Failed to save protocol.'
  } finally {
    saving.value = false
  }
}

function cloneValue(value) {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

watch(
  () => selectedEvent?.value?.event_type,
  (next, prev) => {
    if (!selectedEvent.value) return
    if (next && next !== prev) {
      selectedEvent.value.details = ensureDetailsByType(next, selectedEvent.value.details)
    }
  }
)

function ensureDetailsByType(eventType, details = null) {
  const base = cloneValue(details || {})
  switch (eventType) {
    case 'transfer':
      return {
        type: 'transfer',
        source_role: base.source_role || '',
        target_role: base.target_role || '',
        mapping: Array.isArray(base.mapping) ? base.mapping : [{ source_well: '', target_well: '' }],
        volume: base.volume || '',
        material: base.material || null,
        material_revision: base.material_revision || '',
        notes: base.notes || '',
        pipetting_hint: base.pipetting_hint || null
      }
    case 'incubate':
      return {
        type: 'incubate',
        labware_role: base.labware_role || '',
        wells: Array.isArray(base.wells) ? base.wells : [],
        duration: base.duration || '',
        temperature: base.temperature || '',
        atmosphere: base.atmosphere || '',
        notes: base.notes || ''
      }
    case 'read':
      return {
        type: 'read',
        labware_role: base.labware_role || '',
        instrument: base.instrument || '',
        mode: base.mode || '',
        channels: Array.isArray(base.channels) ? base.channels : [],
        result_files: Array.isArray(base.result_files) ? base.result_files : [],
        notes: base.notes || ''
      }
    case 'wash':
      return {
        type: 'wash',
        labware_role: base.labware_role || '',
        wells: Array.isArray(base.wells) ? base.wells : [],
        buffer: base.buffer || null,
        cycles: base.cycles || '',
        volume_per_cycle: base.volume_per_cycle || '',
        notes: base.notes || ''
      }
    default:
      return {
        type: 'other',
        name: base.name || '',
        description: base.description || '',
        labware_role: base.labware_role || '',
        metadata: base.metadata || {}
      }
  }
}

function formatEventSummary(event, index) {
  const base = `${index + 1}. ${event.label} (${event.event_type})`
  const detail = summarizeDetails(event)
  return detail ? `${base} — ${detail}` : base
}

function summarizeDetails(event) {
  const details = event.details || {}
  switch (event.event_type) {
    case 'transfer':
      return `${details.source_role || 'source'} → ${details.target_role || 'target'} · ${details.mapping?.length || 0} mapping(s)`
    case 'incubate':
      return `${details.labware_role || ''} for ${details.duration || '?'}`.trim()
    case 'read':
      return `${details.mode || 'read'} on ${details.instrument || 'instrument'}`
    case 'wash':
      return `${details.labware_role || ''} · ${details.cycles || 1} cycle(s)`
    case 'other':
      return details.name || ''
    default:
      return ''
  }
}

function addMappingRow() {
  if (!selectedEvent.value || selectedEvent.value.event_type !== 'transfer') return
  selectedEvent.value.details.mapping.push({ source_well: '', target_well: '' })
}

function removeMappingRow(index) {
  if (!selectedEvent.value || selectedEvent.value.event_type !== 'transfer') return
  selectedEvent.value.details.mapping = selectedEvent.value.details.mapping.filter((_, idx) => idx !== index)
  if (!selectedEvent.value.details.mapping.length) {
    selectedEvent.value.details.mapping.push({ source_well: '', target_well: '' })
  }
}

function updateCommaSeparated(field, value) {
  if (!selectedEvent.value) return
  const list = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  selectedEvent.value.details[field] = list
}

function handleCreateTransferStep(step) {
  if (!step?.details?.mapping?.length) {
    status.value = 'Add at least one mapping before creating a transfer step.'
    return
  }
  const nextId = `evt-${protocolState.events.length + 1}`
  protocolState.events = [
    ...protocolState.events,
    {
      id: nextId,
      phase: '',
      event_type: 'transfer',
      label: step.label || 'Transfer',
      notes: step.notes || '',
      details: {
        type: 'transfer',
        source_role: step.details.source_role,
        target_role: step.details.target_role,
        mapping: step.details.mapping,
        volume: step.details.volume || '',
        material: step.details.material || null,
        material_revision: step.details.material_revision || ''
      }
    }
  ]
  selectedEventIndex.value = protocolState.events.length - 1
  status.value = `Added transfer step (${step.details.mapping.length} mappings)`
}
  function updateWashBufferLabel(label) {
    if (!selectedEvent.value || selectedEvent.value.event_type !== 'wash') return
    const details = selectedEvent.value.details || {}
    const buffer = details.buffer || {}
    buffer.label = label
    selectedEvent.value.details = {
      ...details,
      buffer
    }
  }
</script>

<template>
  <div class="protocol-editor-shell">
    <header class="protocol-editor-shell__header">
      <div>
        <p class="app-kicker">Protocol Editor</p>
        <h1>{{ protocolState.metadata?.title || 'Untitled protocol' }}</h1>
        <p class="app-subtitle">{{ recordPath }}</p>
      </div>
      <div class="protocol-editor-shell__actions">
        <button class="secondary" type="button" :disabled="loading" @click="loadRecord">Reload</button>
        <button class="primary" type="button" :disabled="!isDirty || saving" @click="handleSave">
          {{ saving ? 'Saving…' : 'Save protocol' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="status status-error">{{ error }}</p>
    <p v-else-if="status" class="status status-ok">{{ status }}</p>

    <div class="protocol-editor-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab', { active: activeTab === tab.id }]"
        type="button"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'info'" class="panel">
      <label>
        Title
        <input v-model="protocolState.metadata.title" type="text" placeholder="Protocol title" />
      </label>
      <label>
        Family
        <input v-model="protocolState.metadata.family" type="text" placeholder="e.g. ros_mmp_insulin" />
      </label>
      <label>
        Version
        <input v-model="protocolState.metadata.version" type="text" placeholder="1.0.0" />
      </label>
      <label>
        Description
        <textarea v-model="protocolState.metadata.description" rows="4" placeholder="High-level summary" />
      </label>
    </section>

    <section v-else-if="activeTab === 'labware'" class="panel">
      <div class="panel-header">
        <h2>Labware roles</h2>
        <button type="button" class="secondary" @click="addLabwareRole">Add role</button>
      </div>
      <div v-if="!protocolState.labwareRoles.length" class="empty-state">No labware roles yet.</div>
      <div v-for="(role, index) in protocolState.labwareRoles" :key="role.id || index" class="labware-role-row">
        <div class="field-pair">
          <label>
            Name
            <input v-model="role.name" type="text" placeholder="cell_plate" />
          </label>
          <label>
            Kind
            <select v-model="role.kind">
              <option v-for="kind in LABWARE_KINDS" :key="kind" :value="kind">{{ kind }}</option>
            </select>
          </label>
        </div>
        <div class="field-pair">
          <label>
            Plate type
            <input v-model="role.plate_type" type="text" placeholder="96-flat-clear" />
          </label>
          <label>
            Default labware id
            <input v-model="role.default_labware_id" type="text" placeholder="plate/PLT-0001" />
          </label>
        </div>
        <label>
          Description
          <textarea v-model="role.description" rows="2" placeholder="Describe this labware role" />
        </label>
        <div class="row-actions">
          <button class="link" type="button" @click="removeLabwareRole(index)">Remove role</button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'events'" class="panel events-panel">
      <div class="transfer-builder">
        <TransferStepSidecar
          :focus-side="transferFocusSide"
          :source-selection="sourceSelection.selection"
          :target-selection="targetSelection.selection"
          :parameter-names="parameterNames"
          :source-role-options="labwareRoleNames"
          :target-role-options="labwareRoleNames"
          :source-role="sourceRole"
          :target-role="targetRole"
          @update:focus-side="handleTransferFocusSide"
          @update:source-selection="handleSourceSelectionUpdate"
          @update:target-selection="handleTargetSelectionUpdate"
          @update:source-role="(role) => (sourceRole = role)"
          @update:target-role="(role) => (targetRole = role)"
          @create-step="handleCreateTransferStep"
        />
        <div class="transfer-grids">
          <LabwareGrid
            v-if="sourceLayoutIndex"
            :layout-index="sourceLayoutIndex"
            :wells="{}"
            :selection="sourceSelection.selection"
            title="Source"
            :subtitle="sourceRole || 'Select a source role'"
            @well-click="(payload) => handleGridInteraction('source', payload)"
          />
          <LabwareGrid
            v-if="targetLayoutIndex"
            :layout-index="targetLayoutIndex"
            :wells="{}"
            :selection="targetSelection.selection"
            title="Target"
            :subtitle="targetRole || 'Select a target role'"
            @well-click="(payload) => handleGridInteraction('target', payload)"
          />
        </div>
      </div>

      <div class="event-outline">
        <div class="event-outline__header">
          <h2>Events</h2>
          <button type="button" class="secondary" @click="addEvent">Add event</button>
        </div>
        <ul>
          <li
            v-for="(event, index) in protocolState.events"
            :key="event.id || index"
            :class="['event-outline__item', { active: index === selectedEventIndex }]"
            @click="selectEvent(index)"
          >
            <div>
              <strong>{{ event.label }}</strong>
              <p>{{ event.event_type }}</p>
            </div>
            <div class="event-outline__actions">
              <button class="ghost" type="button" @click.stop="moveEvent(index, -1)" :disabled="index === 0">↑</button>
              <button
                class="ghost"
                type="button"
                @click.stop="moveEvent(index, 1)"
                :disabled="index === protocolState.events.length - 1"
              >
                ↓
              </button>
            </div>
          </li>
        </ul>
        <div v-if="protocolState.events.length" class="event-outline__footer">
          <button class="link" type="button" @click="removeEvent(selectedEventIndex)" :disabled="selectedEventIndex < 0">
            Remove selected
          </button>
        </div>
        <div v-else class="empty-state">No events yet.</div>
      </div>
      <div class="event-editor" v-if="selectedEvent">
        <label>
          Label
          <input v-model="selectedEvent.label" type="text" />
        </label>
        <label>
          Event type
          <select
            v-model="selectedEvent.event_type"
            @change="selectedEvent.details = ensureDetailsByType(selectedEvent.event_type, selectedEvent.details)"
          >
            <option v-for="kind in DEFAULT_EVENT_TYPES" :key="kind" :value="kind">{{ kind }}</option>
          </select>
        </label>
        <label>
          Phase
          <input v-model="selectedEvent.phase" type="text" placeholder="Phase name (optional)" />
        </label>
        <label>
          Notes
          <textarea v-model="selectedEvent.notes" rows="4" placeholder="Notes for operators" />
        </label>
        <div class="event-editor__hint">
          Configure event-specific details below. Parameter references can be entered using <code>${'{param}'}</code>
          syntax.
        </div>
        <div v-if="selectedEvent.event_type === 'transfer'" class="detail-group">
          <label>
            Source role
            <input v-model="selectedEvent.details.source_role" type="text" placeholder="media_reservoir" />
          </label>
          <label>
            Target role
            <input v-model="selectedEvent.details.target_role" type="text" placeholder="cell_plate" />
          </label>
          <div class="field">
            <label>Material</label>
            <MaterialPicker
              :materials="availableMaterials"
              :selected-id="selectedEvent.details.material"
              :role="selectedEvent.details.target_role"
              @select="handleMaterialSelect"
            />
            <p class="status" v-if="selectedEvent.details.material_revision">
              Revision: {{ selectedEvent.details.material_revision }}
            </p>
            <label>
              Revision override (optional)
              <input
                v-model="selectedEvent.details.material_revision"
                type="text"
                placeholder="materialrev:ros_dye@20250101T000000"
              />
            </label>
          </div>
          <label>
            Volume
            <input v-model="selectedEvent.details.volume" type="text" placeholder="100 uL or ${seed_volume}" />
          </label>
          <div class="mapping-editor">
            <div class="mapping-header">
              <h3>Well mapping</h3>
              <button class="secondary" type="button" @click="addMappingRow">Add mapping</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Source well</th>
                  <th>Target well</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(mapping, idx) in selectedEvent.details.mapping" :key="idx">
                  <td><input v-model="mapping.source_well" type="text" placeholder="A1" /></td>
                  <td><input v-model="mapping.target_well" type="text" placeholder="B1" /></td>
                  <td>
                    <button class="ghost" type="button" @click="removeMappingRow(idx)" :disabled="selectedEvent.details.mapping.length === 1">
                      ✕
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else-if="selectedEvent.event_type === 'incubate'" class="detail-group">
          <label>
            Labware role
            <input v-model="selectedEvent.details.labware_role" type="text" placeholder="cell_plate" />
          </label>
          <label>
            Wells (comma-separated)
            <input
              :value="selectedEvent.details.wells?.join(', ')"
              type="text"
              placeholder="A1, A2, B1"
              @input="updateCommaSeparated('wells', $event.target.value)"
            />
          </label>
          <label>
            Duration
            <input v-model="selectedEvent.details.duration" type="text" placeholder="30 min or ${incubation_time}" />
          </label>
          <label>
            Temperature
            <input v-model="selectedEvent.details.temperature" type="text" placeholder="37 C" />
          </label>
          <label>
            Atmosphere
            <input v-model="selectedEvent.details.atmosphere" type="text" placeholder="5% CO2" />
          </label>
        </div>
        <div v-else-if="selectedEvent.event_type === 'read'" class="detail-group">
          <label>
            Labware role
            <input v-model="selectedEvent.details.labware_role" type="text" placeholder="cell_plate" />
          </label>
          <label>
            Instrument
            <input v-model="selectedEvent.details.instrument" type="text" placeholder="reader/EnVision" />
          </label>
          <label>
            Mode
            <input v-model="selectedEvent.details.mode" type="text" placeholder="fluorescence" />
          </label>
          <label>
            Channels (comma-separated)
            <input
              :value="selectedEvent.details.channels?.join(', ')"
              type="text"
              placeholder="FITC, TRITC"
              @input="updateCommaSeparated('channels', $event.target.value)"
            />
          </label>
        </div>
        <div v-else-if="selectedEvent.event_type === 'wash'" class="detail-group">
          <label>
            Labware role
            <input v-model="selectedEvent.details.labware_role" type="text" placeholder="cell_plate" />
          </label>
          <label>
            Wells (comma-separated)
            <input
              :value="selectedEvent.details.wells?.join(', ')"
              type="text"
              placeholder="A1, A2"
              @input="updateCommaSeparated('wells', $event.target.value)"
            />
          </label>
          <label>
            Buffer label
            <input
              :value="selectedEvent.details.buffer?.label || ''"
              type="text"
              placeholder="PBS 1x"
              @input="updateWashBufferLabel($event.target.value)"
            />
          </label>
          <label>
            Cycles
            <input v-model="selectedEvent.details.cycles" type="number" min="1" placeholder="3" />
          </label>
          <label>
            Volume per cycle
            <input v-model="selectedEvent.details.volume_per_cycle" type="text" placeholder="200 uL" />
          </label>
        </div>
        <div v-else-if="selectedEvent.event_type === 'other'" class="detail-group">
          <label>
            Name
            <input v-model="selectedEvent.details.name" type="text" placeholder="Shake" />
          </label>
          <label>
            Description
            <textarea v-model="selectedEvent.details.description" rows="3" placeholder="Describe the custom action" />
          </label>
          <label>
            Labware role (optional)
            <input v-model="selectedEvent.details.labware_role" type="text" />
          </label>
        </div>
      </div>
      <div v-else class="event-editor empty-state">Select an event to edit details.</div>
    </section>
    <section v-else class="panel preview-panel">
      <h2>Preview</h2>
      <p>This preview lists the ordered event templates. Parameter interpolation and plate simulation will refine in later phases.</p>
      <ol class="preview-list">
        <li v-for="summary in previewEvents" :key="summary">{{ summary }}</li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.protocol-editor-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.protocol-editor-shell__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.protocol-editor-shell__actions {
  display: flex;
  gap: 0.5rem;
}

.protocol-editor-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.protocol-editor-tabs .tab {
  border: none;
  background: transparent;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-weight: 600;
  color: #475569;
}

.protocol-editor-tabs .tab.active {
  color: #0f172a;
  border-bottom: 2px solid #0f172a;
}

.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-weight: 600;
  color: #334155;
}

input,
textarea,
select {
  border: 1px solid #cbd5f5;
  border-radius: 0.375rem;
  padding: 0.5rem;
  font: inherit;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.labware-role-row {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field-pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.row-actions {
  text-align: right;
}

.events-panel {
  display: grid;
  grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
  gap: 1rem;
}

.event-outline {
  border-right: 1px solid #e2e8f0;
  padding-right: 1rem;
}

.event-outline__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.event-outline ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.event-outline__item {
  border: 1px solid transparent;
  border-radius: 0.375rem;
  padding: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.event-outline__item.active {
  border-color: #6366f1;
  background: #eef2ff;
}

.event-outline__actions {
  display: flex;
  gap: 0.25rem;
}

.event-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-top: 1px solid #e2e8f0;
  padding-top: 0.75rem;
}

.transfer-builder {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.transfer-grids {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
  width: 100%;
}

.mapping-editor table {
  width: 100%;
  border-collapse: collapse;
}

.mapping-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.mapping-editor th,
.mapping-editor td {
  border: 1px solid #e2e8f0;
  padding: 0.35rem;
  text-align: left;
}

.preview-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.preview-list {
  padding-left: 1.25rem;
  color: #334155;
}

.event-editor__hint {
  font-size: 0.85rem;
  color: #64748b;
}

.empty-state {
  padding: 1rem;
  border: 1px dashed #cbd5f5;
  border-radius: 0.5rem;
  color: #64748b;
  text-align: center;
}

.status {
  font-weight: 600;
}

.status-error {
  color: #dc2626;
}

.status-ok {
  color: #15803d;
}

.app-kicker {
  text-transform: uppercase;
  font-size: 0.8rem;
  color: #64748b;
  letter-spacing: 0.08em;
}

.app-subtitle {
  color: #475569;
  font-size: 0.9rem;
}

.ghost {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.25rem;
}

.link {
  border: none;
  background: none;
  color: #2563eb;
  cursor: pointer;
  font-weight: 600;
}

.secondary {
  border: 1px solid #cbd5f5;
  background: #fff;
  border-radius: 0.375rem;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}

.primary {
  border: none;
  background: #4338ca;
  color: #fff;
  border-radius: 0.375rem;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
}
</style>
