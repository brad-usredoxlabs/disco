<script setup>
import { computed, ref, watch } from 'vue'
import MaterialPicker from './MaterialPicker.vue'
import OntologyFieldInput from '../../tiptap/nodes/OntologyFieldInput.vue'
import RevisionReviewModal from '../../components/RevisionReviewModal.vue'
import MaterialRevisionViewer from '../../components/MaterialRevisionViewer.vue'
import { ensureMaterialId } from '../utils/materialId'

const props = defineProps({
  roles: {
    type: Array,
    default: () => []
  },
  materials: {
    type: Array,
    default: () => []
  },
  selectionCount: {
    type: Number,
    default: 0
  },
  recentIds: {
    type: Array,
    default: () => []
  },
  favoriteIds: {
    type: Array,
    default: () => []
  },
  prefillSelection: {
    type: Object,
    default: null
  },
  features: {
    type: Array,
    default: () => []
  },
  ontologyVocab: {
    type: String,
    default: ''
  },
  ontologySearchOptions: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits([
  'apply',
  'remove',
  'favorite-toggle',
  'request-create',
  'request-edit',
  'request-import'
])

const CONTROL_KIND_OPTIONS = [
  { value: 'positive_control', label: 'Positive control' },
  { value: 'negative_control', label: 'Negative control' },
  { value: 'baseline_control', label: 'Baseline control' },
  { value: 'reference_control', label: 'Reference control' },
  { value: 'other', label: 'Other' }
]

const EXPECTED_EFFECT_OPTIONS = [
  { value: 'increase', label: 'Increase' },
  { value: 'decrease', label: 'Decrease' },
  { value: 'none', label: 'No change' },
  { value: 'unknown', label: 'Unknown' }
]

const selectedRole = ref('')
const selectedMaterial = ref(null)
const pendingMaterial = ref(null)
const showConfirmModal = ref(false)
const revisionForm = ref(buildEmptyRevisionForm())
const selectedIntent = ref('')
const volumeValue = ref('')
const volumeUnit = ref('uL')
const concentrationValue = ref('')
const concentrationUnit = ref('uM')
const controlIntentRows = ref([])
let controlIntentCounter = 0

const featureOptions = computed(() => props.features || [])
const useOntologySearch = computed(() => Boolean(props.ontologyVocab))
const filteredMaterials = computed(() =>
  Array.isArray(props.materials) ? props.materials.filter((m) => m?.category !== 'waste') : []
)
const materialIntentOptions = computed(() =>
  Array.isArray(selectedMaterial.value?.experimental_intents) ? selectedMaterial.value.experimental_intents : []
)
const requiresIntentChoice = computed(() => materialIntentOptions.value.length > 1)
const resolvedIntent = computed(() => {
  if (!materialIntentOptions.value.length) return ''
  if (materialIntentOptions.value.length === 1) return materialIntentOptions.value[0]
  return selectedIntent.value || ''
})
const requireConcentration = computed(() => !selectedMaterial.value?.isAdHoc)

const mergedSearchOptions = computed(() => {
  if (!useOntologySearch.value) return props.ontologySearchOptions
  return {
    ...props.ontologySearchOptions,
    localMaterials: filteredMaterials.value
  }
})

watch(
  () => props.roles,
  (roles) => {
    if (!roles?.length) return
    if (!selectedRole.value) {
      selectedRole.value = roles[0].role || roles[0].value || roles[0]
    }
  },
  { immediate: true }
)

watch(
  () => props.prefillSelection,
  (payload) => {
    if (!payload || !payload.id) return
    const entry = props.materials.find((item) => item.id === payload.id) || payload
    selectMaterial(entry, { forceRole: true })
  },
  { deep: true }
)

watch(
  () => props.materials,
  (list = []) => {
    if (useOntologySearch.value) return
    if (!selectedMaterial.value?.id) return
    const next = list.find((entry) => entry.id === selectedMaterial.value.id)
    selectedMaterial.value = next || null
  }
)

watch(
  () => props.features,
  () => {
    const allowed = new Set(featureOptions.value.map((feature) => feature.id))
    controlIntentRows.value = controlIntentRows.value.filter((row) => !row.feature || allowed.has(row.feature))
  },
  { deep: true }
)

const canApply = computed(() => {
  const isWaste = selectedMaterial.value?.category === 'waste'
  const intentSatisfied = !requiresIntentChoice.value || Boolean(selectedIntent.value)
  const hasConcentration = requireConcentration.value ? concentrationValue.value && concentrationUnit.value : true
  return Boolean(
    props.selectionCount &&
      selectedRole.value &&
      selectedMaterial.value?.id &&
      !isWaste &&
      intentSatisfied &&
      volumeValue.value &&
      volumeUnit.value &&
      hasConcentration
  )
})

const canRemove = computed(() => {
  return Boolean(props.selectionCount && selectedMaterial.value?.id)
})

function handleMaterialSelect(entry) {
  if (entry?.id) {
    pendingMaterial.value = entry
    populateRevisionForm(entry)
    showConfirmModal.value = true
  } else {
    selectMaterial(entry)
  }
}

function handleOntologySelect(term) {
  if (!term) {
    selectMaterial(null)
    return
  }
  // allow raw string selections
  if (typeof term === 'string') {
    const text = term.trim()
    if (!text) {
      selectMaterial(null)
      return
    }
    emit('request-import', { term: { id: text, label: text }, normalized: { id: text, label: text } })
    selectMaterial(null)
    return
  }
  if (term.useAdHoc) {
    const adHoc = createAdHocMaterial(term.label || term.id || '')
    selectMaterial(adHoc)
    return
  }
  const normalized = {
    id: term.id || term.identifier || term['@id'] || '',
    label: term.label || term.prefLabel || term.id || '',
    source: term.source || term.ontology || '',
    provenance: term.provenance || ''
  }
  const localEntry = findLocalMaterial(normalized)
  if (localEntry) {
    pendingMaterial.value = localEntry
    populateRevisionForm(localEntry)
    showConfirmModal.value = true
    return
  }
  emit('request-import', { term, normalized })
  selectMaterial(null)
}

function handleOntologyAddTerm(label = '') {
  const text = typeof label === 'string' ? label.trim() : ''
  if (!text) return
  const payload = { term: { id: text, label: text }, normalized: { id: text, label: text } }
  emit('request-import', payload)
}

function handleApply() {
  if (!canApply.value) return
  emit('apply', {
    role: selectedRole.value,
    materialId: selectedMaterial.value.id,
    materialRevision: selectedMaterial.value.material_revision || selectedMaterial.value.latest_revision_id || '',
    materialLabel: selectedMaterial.value.label,
    experimentalIntent: resolvedIntent.value || '',
    volume: normalizeVolumePayload(),
    concentration: normalizeConcentrationPayload(),
    controlIntents: buildControlIntents()
  })
}

function createAdHocMaterial(label = '') {
  const id = ensureMaterialId(label || 'material')
  return {
    id,
    label: label || id,
    category: 'other',
    experimental_intents: [],
    material_revision: '',
    isAdHoc: true
  }
}

function handleRemove() {
  if (!canRemove.value) return
  emit('remove', {
    role: selectedRole.value,
    materialId: selectedMaterial.value.id
  })
}

function handleFavoriteToggle(payload) {
  emit('favorite-toggle', payload)
}

function handleRequestCreate(payload) {
  emit('request-create', payload)
}

function handleRequestEdit(entry) {
  emit('request-edit', entry)
}

function buildEmptyRevisionForm() {
  return {
    id: '',
    label: '',
    category: '',
    experimental_intents: [],
    tags: [],
    measures: [],
    xref: {},
    classified_as: [],
    mechanism: { type: '', targets: [] },
    affected_processes: [],
    control_role: '',
    control_for: { features: [], acquisition_modalities: [], notes: '' }
  }
}

function populateRevisionForm(material = {}) {
  const latest = material.latest_revision || {}
  const src = { ...latest, ...material }
  revisionForm.value = {
    id: src.id || material.id || '',
    label: src.label || material.label || '',
    category: src.category || material.category || '',
    experimental_intents: Array.isArray(src.experimental_intents) ? [...src.experimental_intents] : [],
    tags: Array.isArray(src.tags) ? [...src.tags] : [],
    measures: Array.isArray(src.measures) ? [...src.measures] : [],
    xref: src.xref && typeof src.xref === 'object' ? { ...src.xref } : {},
    classified_as: Array.isArray(src.classified_as) ? [...src.classified_as] : [],
    mechanism: {
      type: src.mechanism?.type || '',
      targets: Array.isArray(src.mechanism?.targets) ? [...src.mechanism.targets] : []
    },
    affected_processes: Array.isArray(src.affected_processes)
      ? [...src.affected_processes]
      : src.affected_process
      ? [src.affected_process]
      : [],
    control_role: src.control_role || '',
    control_for: {
      features: Array.isArray(src.control_for?.features) ? [...src.control_for.features] : [],
      acquisition_modalities: Array.isArray(src.control_for?.acquisition_modalities)
        ? [...src.control_for.acquisition_modalities]
        : [],
      notes: src.control_for?.notes || ''
    }
  }
}

function findLocalMaterial(normalized = {}) {
  const targetId = (normalized.id || '').trim().toLowerCase()
  const targetLabel = (normalized.label || '').trim().toLowerCase()
  const candidates = props.materials || []
  const direct = candidates.find(
    (item) => item.id?.toLowerCase() === targetId || item.label?.toLowerCase() === targetLabel
  )
  if (direct) return direct
  if (!targetId && !targetLabel) return null
  const byXref = candidates.find((item) =>
    Object.values(item.xref || {}).some((val) => typeof val === 'string' && val.trim().toLowerCase() === targetId)
  )
  return byXref || null
}

function confirmMaterialSelection() {
  if (!pendingMaterial.value) return
  selectMaterial(pendingMaterial.value)
  showConfirmModal.value = false
  pendingMaterial.value = null
}

function requestNewRevision() {
  if (!pendingMaterial.value) return
  emit('request-revision', pendingMaterial.value)
  showConfirmModal.value = false
  pendingMaterial.value = null
}

function normalizeAmount() {
  // legacy helper retained for compatibility
  return normalizeVolumePayload()
}

function normalizeVolumePayload() {
  if (!volumeValue.value || !volumeUnit.value) return null
  const value = Number(volumeValue.value)
  if (!Number.isFinite(value)) return null
  return { value, unit: volumeUnit.value }
}

function normalizeConcentrationPayload() {
  if (!concentrationValue.value || !concentrationUnit.value) return null
  const value = Number(concentrationValue.value)
  if (!Number.isFinite(value)) return null
  return { value, unit: concentrationUnit.value }
}

function selectMaterial(entry, options = {}) {
  selectedMaterial.value = entry || null
  const intents = Array.isArray(entry?.experimental_intents) ? entry.experimental_intents : []
  selectedIntent.value = intents.length === 1 ? intents[0] : ''
  if (!entry) return
  const shouldApplyRole = options.forceRole || !selectedRole.value
  const defaults = entry?.defaults || {}
  if (defaults.role && shouldApplyRole) {
    selectedRole.value = defaults.role
  }
  const volumeDefaults = defaults.add_volume || defaults.amount
  if (volumeDefaults) {
    volumeValue.value = volumeDefaults.value ?? ''
    volumeUnit.value = volumeDefaults.unit ?? 'uL'
  }
  const concentrationDefaults =
    defaults.concentration || defaults.working_concentration || defaults.stock_concentration
  if (concentrationDefaults) {
    concentrationValue.value = concentrationDefaults.value ?? ''
    concentrationUnit.value = concentrationDefaults.unit ?? 'uM'
  }
}

function addControlIntentRow(prefill = {}) {
  if (!featureOptions.value.length) return
  controlIntentCounter += 1
  controlIntentRows.value = [
    ...controlIntentRows.value,
    {
      id: `ci-${controlIntentCounter}-${Date.now()}`,
      feature: prefill.feature || '',
      kind: prefill.kind || '',
      expected_effect: prefill.expected_effect || ''
    }
  ]
}

function removeControlIntentRow(id) {
  controlIntentRows.value = controlIntentRows.value.filter((row) => row.id !== id)
}

function buildControlIntents() {
  return controlIntentRows.value
    .map((row) => {
      const feature = typeof row.feature === 'string' ? row.feature.trim() : ''
      const kind = typeof row.kind === 'string' ? row.kind.trim() : ''
      if (!feature || !kind) return null
      const entry = { feature, kind }
      const effect =
        typeof row.expected_effect === 'string' ? row.expected_effect.trim() : ''
      if (effect) {
        entry.expected_effect = effect
      }
      return entry
    })
    .filter(Boolean)
}

function handleIntentSelect(intent) {
  if (!intent) return
  selectedIntent.value = intent
}
</script>

<template>
  <div class="apply-bar">
    <div class="picker-group">
      <label>Material</label>
      <OntologyFieldInput
        v-if="useOntologySearch"
        class="ontology-picker"
        :value="selectedMaterial"
        :vocab="ontologyVocab"
        :search-options="mergedSearchOptions"
        :show-add-button="true"
        placeholder="Search materials…"
        @update:value="handleOntologySelect"
        @request-add="handleOntologyAddTerm"
      />
      <MaterialPicker
        v-else
        :materials="filteredMaterials"
        :selected-id="selectedMaterial?.id"
        :role="selectedRole"
        :recent-ids="recentIds"
        :favorite-ids="favoriteIds"
        @select="handleMaterialSelect"
        @favorite-toggle="handleFavoriteToggle"
        @request-create="handleRequestCreate"
        @request-edit="handleRequestEdit"
        @request-revision="(mat) => emit('request-revision', mat)"
      />
    </div>
    <RevisionReviewModal
      :open="showConfirmModal"
      title="Review material"
      :concept="pendingMaterial"
      :revision="pendingMaterial?.latest_revision"
      @cancel="showConfirmModal = false"
      @use="confirmMaterialSelection"
      @create-new="requestNewRevision"
    >
      <MaterialRevisionViewer v-if="pendingMaterial?.latest_revision" :revision="pendingMaterial.latest_revision" />
      <p v-else class="muted">No active revision found for this material.</p>
    </RevisionReviewModal>

    <div v-if="materialIntentOptions.length" class="intent-panel">
      <p class="intent-label">Experimental intent</p>
      <div class="intent-chips">
        <button
          v-for="intent in materialIntentOptions"
          :key="intent"
          type="button"
          class="intent-chip"
          :class="{ active: selectedIntent === intent }"
          :disabled="materialIntentOptions.length === 1"
          @click="handleIntentSelect(intent)"
        >
          {{ intent }}
        </button>
      </div>
      <p v-if="requiresIntentChoice && !selectedIntent" class="muted tiny">Select an intent before applying.</p>
    </div>

    <div class="field-group">
      <label>Role</label>
      <select v-model="selectedRole">
        <option value="" disabled>Select role…</option>
        <option v-for="role in roles" :key="role.role || role" :value="role.role || role">
          {{ role.label || role.role || role }}
        </option>
      </select>
    </div>

    <div class="amount-row">
      <div class="field-group">
        <label>Volume</label>
        <div class="amount-inputs">
          <input v-model="volumeValue" type="number" min="0" step="any" placeholder="Value" />
          <select v-model="volumeUnit">
            <option value="uL">µL</option>
            <option value="mL">mL</option>
          </select>
        </div>
      </div>
      <div class="actions">
        <button class="primary" type="button" :disabled="!canApply" @click="handleApply">
          Apply to {{ selectionCount }} wells
        </button>
        <button class="danger" type="button" :disabled="!canRemove" @click="handleRemove">
          Remove material
        </button>
      </div>
    </div>

    <div class="amount-row stack">
      <div class="field-group">
        <label>Concentration</label>
        <div class="amount-inputs">
          <input v-model="concentrationValue" type="number" min="0" step="any" placeholder="Value" />
          <select v-model="concentrationUnit">
            <option value="mM">mM</option>
            <option value="uM">µM</option>
            <option value="nM">nM</option>
            <option value="pM">pM</option>
            <option value="mg/mL">mg/mL</option>
            <option value="X">X (fold)</option>
            <option value="each">each / units</option>
            <option value="%">percent</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="featureOptions.length" class="control-section">
      <div class="control-header">
        <label>Control intents</label>
        <button class="ghost tiny" type="button" :disabled="!featureOptions.length" @click="addControlIntentRow()">
          Add control intent
        </button>
      </div>
      <p class="control-help">Tag this material as a control for specific observable features/channels.</p>
      <div v-if="controlIntentRows.length" class="control-rows">
        <div v-for="row in controlIntentRows" :key="row.id" class="control-row">
          <select v-model="row.feature">
            <option value="">Feature…</option>
            <option v-for="feature in featureOptions" :key="feature.id" :value="feature.id">
              {{ feature.label }}
            </option>
          </select>
          <select v-model="row.kind">
            <option value="">Kind…</option>
            <option v-for="option in CONTROL_KIND_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <select v-model="row.expected_effect">
            <option value="">Expected effect</option>
            <option v-for="option in EXPECTED_EFFECT_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <button class="ghost tiny" type="button" @click="removeControlIntentRow(row.id)">Remove</button>
        </div>
      </div>
      <p v-else class="control-placeholder">No control intents selected.</p>
    </div>
  </div>
</template>

<style scoped>
.apply-bar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

label {
  font-weight: 600;
  color: #0f172a;
}

select,
input {
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.4rem 0.6rem;
  font-size: 0.95rem;
}

.picker-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ontology-picker {
  width: 100%;
}

.intent-panel {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.intent-label {
  margin: 0;
  font-weight: 600;
}

.intent-chips {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.intent-chip {
  border: 1px solid #cbd5f5;
  background: #f8fafc;
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  cursor: pointer;
}

.intent-chip.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.amount-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  align-items: end;
}

.amount-inputs {
  display: grid;
  grid-template-columns: 1fr 120px;
  gap: 0.35rem;
}

.amount-inputs input {
  flex: 1;
}

.amount-row.stack {
  grid-template-columns: 1fr;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.primary,
.danger {
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.primary {
  background: #2563eb;
  color: #fff;
}

.primary:disabled,
.danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.danger {
  background: #fee2e2;
  color: #991b1b;
}

.control-section {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-help {
  margin: 0;
  font-size: 0.8rem;
  color: #475569;
}

.control-rows {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.control-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.35rem;
  align-items: center;
}

.control-placeholder {
  font-size: 0.8rem;
  color: #94a3b8;
  font-style: italic;
}

.ghost {
  border: 1px solid #cbd5f5;
  border-radius: 999px;
  background: transparent;
  color: #0f172a;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
}

.ghost.tiny {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
}

.confirm-modal {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  z-index: 20;
}

.confirm-card {
  background: #fff;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  max-width: 640px;
  width: 100%;
}

.confirm-card header h4 {
  margin: 0 0 0.25rem 0;
}

.confirm-card .muted {
  margin: 0;
}

.revision-preview {
  margin-top: 0.75rem;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.5rem;
}

.preview-grid label {
  font-weight: 600;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.preview-grid input,
.preview-grid textarea {
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  padding: 0.35rem 0.45rem;
  font-size: 0.95rem;
}

.confirm-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.confirm-modal {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  z-index: 20;
}

.confirm-card {
  background: #fff;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  max-width: 440px;
  width: 100%;
}

.confirm-card header h4 {
  margin: 0 0 0.25rem 0;
}

.confirm-card .muted {
  margin: 0;
}

.confirm-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
  flex-wrap: wrap;
}
</style>
