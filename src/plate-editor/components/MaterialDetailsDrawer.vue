<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { generateUniqueMaterialId } from '../utils/materialId'
import OntologyFieldInput from '../../tiptap/nodes/OntologyFieldInput.vue'

const CATEGORY_OPTIONS = [
  { value: 'cells', label: 'Cells / cell lines' },
  { value: 'compound', label: 'Compound / treatment' },
  { value: 'dye', label: 'Dye / reporter' },
  { value: 'buffer', label: 'Buffer / solution' },
  { value: 'mastermix', label: 'Master mix' },
  { value: 'primer', label: 'Primer / probe' },
  { value: 'vehicle', label: 'Vehicle / solvent' },
  { value: 'control', label: 'Control' },
  { value: 'other', label: 'Other' }
]

const INTENT_OPTIONS = ['sample', 'treatment', 'assay_material', 'control', 'other']
const MECHANISM_TYPES = ['agonist', 'antagonist', 'activator', 'inhibitor', 'inducer', 'suppressor', 'uncoupler', 'other']
const ACQUISITION_MODALITIES = ['fluorescence', 'absorbance', 'luminescence', 'microscopy', 'ms', 'qpcr', 'other']
const XREF_KEYS = ['chebi', 'cl', 'cellosaurus', 'ncit', 'ncbitaxon', 'go', 'other']
const TARGET_VOCAB = 'mechanism-targets'
const PROCESS_VOCAB = 'mechanism-processes'
const CROSSREF_VOCAB = 'material-xrefs'
const CROSSREF_KEY_MAP = {
  chebi: 'chebi',
  cl: 'cl',
  clo: 'cellosaurus',
  cellosaurus: 'cellosaurus',
  ncit: 'ncit'
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  entry: { type: Object, default: () => null },
  seedLabel: { type: String, default: '' },
  seedTags: { type: Array, default: () => [] },
  roleOptions: { type: Array, default: () => [] },
  existingIds: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'cancel', 'save'])

const form = reactive({
  label: '',
  category: '',
  experimentalIntents: [],
  extraTags: '',
  synonymsText: '',
  defaultsRole: '',
  amountValue: '',
  amountUnit: '',
  measures: '',
  detection: {
    modality: '',
    channel_hint: '',
    excitation_nm: '',
    emission_nm: ''
  },
  mechanism: {
    type: '',
    targets: []
  },
  classified_as: [],
  classificationDraft: {
    term: null,
    domain: '',
    role: ''
  },
  affectedProcessTerm: null,
  affectedProcesses: [],
  control_role: '',
  control_for: {
    featuresInput: '',
    acquisition_modalities: [],
    notes: ''
  },
  xrefTerm: null,
  xref: {
    chebi: '',
    cl: '',
    cellosaurus: '',
    ncit: '',
    ncbitaxon: '',
    go: '',
    other: ''
  }
})

const errorMessages = ref([])

const drawerTitle = computed(() => (props.mode === 'edit' ? 'Edit material details' : 'Create material'))

const currentId = computed(() => {
  if (props.mode === 'edit' && props.entry?.id) return props.entry.id
  const base = form.label || props.seedLabel || 'material'
  return generateUniqueMaterialId(base, props.existingIds, { skipId: props.entry?.id })
})

const parsedTags = computed(() => {
  const bucket = new Set()
  if (form.category) bucket.add(form.category)
  parseTagsInput(form.extraTags).forEach((tag) => bucket.add(tag))
  return Array.from(bucket)
})

const isSample = computed(() => form.experimentalIntents.includes('sample'))
const isTreatment = computed(() => form.experimentalIntents.includes('treatment'))
const isAssay = computed(() => form.experimentalIntents.includes('assay_material'))
const isControl = computed(() => form.experimentalIntents.includes('control'))
const canAddProcess = computed(() => {
  const term = form.affectedProcessTerm
  return Boolean(term && (term.id || term.identifier))
})

const canSave = computed(() => Boolean(form.label.trim() && parsedTags.value.length && form.experimentalIntents.length))

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      initializeForm()
    } else {
      errorMessages.value = []
    }
  },
  { immediate: true }
)

watch(
  () => [props.entry, props.mode],
  () => {
    if (props.modelValue) {
      initializeForm()
    }
  }
)

function initializeForm() {
  const entry = props.entry || {}
  form.label = entry.label || props.seedLabel || ''
  form.category = entry.category || pickCategory(entry.tags) || deriveCategoryFromSeed() || ''
  const sourceTags = (Array.isArray(entry.tags) && entry.tags.length ? entry.tags : props.seedTags) || []
  form.extraTags = formatExtraTags(sourceTags, form.category)
  form.synonymsText = Array.isArray(entry.synonyms) ? entry.synonyms.join('\n') : ''
  form.experimentalIntents = Array.isArray(entry.experimental_intents) ? [...entry.experimental_intents] : []
  form.defaultsRole = entry.defaults?.role || ''
  form.amountValue = entry.defaults?.amount?.value ?? ''
  form.amountUnit = entry.defaults?.amount?.unit ?? ''
  form.measures = Array.isArray(entry.measures) ? entry.measures.join(', ') : entry.measures || ''
  form.detection = {
    modality: entry.detection?.modality || '',
    channel_hint: entry.detection?.channel_hint || '',
    excitation_nm: entry.detection?.excitation_nm || '',
    emission_nm: entry.detection?.emission_nm || ''
  }
  form.mechanism.type = entry.mechanism?.type || ''
  form.mechanism.targets = Array.isArray(entry.mechanism?.targets)
    ? entry.mechanism.targets.map((t) => ({ id: t.id, label: t.label }))
    : []
  form.classified_as = Array.isArray(entry.classified_as)
    ? entry.classified_as.map((c) => ({ id: c.id, label: c.label, domain: c.domain, source: c.source }))
    : []
  form.affectedProcesses = Array.isArray(entry.affected_processes)
    ? entry.affected_processes.map((p) => ({ id: p.id, label: p.label || p.id }))
    : entry.affected_process?.id
    ? [{ id: entry.affected_process.id, label: entry.affected_process.label || entry.affected_process.id }]
    : []
  form.affectedProcessTerm = null
  form.control_role = entry.control_role || ''
  form.control_for = {
    featuresInput: Array.isArray(entry.control_for?.features) ? entry.control_for.features.join(', ') : entry.control_for?.features || '',
    acquisition_modalities: Array.isArray(entry.control_for?.acquisition_modalities)
      ? [...entry.control_for.acquisition_modalities]
      : [],
    notes: entry.control_for?.notes || ''
  }
  form.xrefTerm = resolveInitialXrefTerm(entry.xref || {})
  XREF_KEYS.forEach((key) => {
    form.xref[key] = entry.xref?.[key] || ''
  })
  errorMessages.value = []
}

function deriveCategoryFromSeed() {
  const seeds = Array.isArray(props.seedTags) ? props.seedTags : []
  const categories = CATEGORY_OPTIONS.map((option) => option.value)
  return seeds.find((tag) => categories.includes(tag)) || ''
}

function pickCategory(tags = []) {
  if (!Array.isArray(tags)) return ''
  const categories = CATEGORY_OPTIONS.map((option) => option.value)
  return tags.find((tag) => categories.includes(tag)) || ''
}

function formatExtraTags(tags = [], category = '') {
  if (!Array.isArray(tags)) return ''
  return tags
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter((tag) => tag && tag !== category)
    .join(', ')
}

function parseTagsInput(value = '') {
  if (!value) return []
  return value
    .split(/[,\n]/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function parseSynonymsInput(value = '') {
  if (!value) return []
  return value
    .split(/\n+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function parseList(value = '') {
  if (!value) return []
  return value
    .split(/[,\n]/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function handleClose() {
  emit('update:modelValue', false)
  emit('cancel')
}

function handleSubmit() {
  const errors = []
  if (!form.label.trim()) errors.push('Label is required.')
  if (!form.category) errors.push('Category is required.')
  if (!form.experimentalIntents.length) errors.push('Select at least one experimental intent.')
  if (!parsedTags.value.length) errors.push('Choose a category or add at least one tag.')
  if ((form.amountValue && !form.amountUnit) || (!form.amountValue && form.amountUnit)) {
    errors.push('Amount requires both value and unit.')
  } else if (form.amountValue && form.amountUnit && !Number.isFinite(Number(form.amountValue))) {
    errors.push('Amount value must be numeric.')
  }
  if (isSample.value && !form.classified_as.length) {
    errors.push('Sample intent requires at least one classification.')
  }
  const hasMechanismTargets = Array.isArray(form.mechanism.targets) && form.mechanism.targets.length
  if (isTreatment.value && form.mechanism.type !== 'other' && (!form.mechanism.type || !hasMechanismTargets)) {
    errors.push('Treatment intent requires mechanism.type and targets (unless type is other).')
  }
  const measureList = parseList(form.measures)
  if (isAssay.value && !measureList.length) {
    errors.push('Assay material intent requires measures (feature IDs).')
  }
  const controlFeatures = parseList(form.control_for.featuresInput)
  if (isControl.value) {
    if (!form.control_role) errors.push('Control intent requires control_role.')
    if (!controlFeatures.length) errors.push('Control intent requires control_for.features.')
  }
  errorMessages.value = errors
  if (errors.length) return
  emit('save', buildEntryPayload())
}

function buildEntryPayload() {
  const entry = {
    id: currentId.value,
    label: form.label.trim(),
    category: form.category || 'other',
    experimental_intents: [...form.experimentalIntents],
    tags: parsedTags.value
  }
  const synonyms = parseSynonymsInput(form.synonymsText)
  if (synonyms.length) entry.synonyms = synonyms
  const measures = parseList(form.measures)
  if (measures.length) entry.measures = measures
  entry.detection = {
    modality: form.detection.modality || '',
    channel_hint: form.detection.channel_hint || '',
    excitation_nm: form.detection.excitation_nm || '',
    emission_nm: form.detection.emission_nm || ''
  }
  if (form.defaultsRole || (form.amountValue && form.amountUnit)) {
    entry.defaults = {}
    if (form.defaultsRole) entry.defaults.role = form.defaultsRole
    if (form.amountValue && form.amountUnit) {
      entry.defaults.amount = { value: Number(form.amountValue), unit: form.amountUnit }
    }
  }
  if (form.mechanism.type && form.mechanism.targets.length) {
    entry.mechanism = { type: form.mechanism.type, targets: form.mechanism.targets }
  }
  if (form.affectedProcesses.length) {
    entry.affected_processes = form.affectedProcesses.map((p) => ({ id: p.id, label: p.label }))
    entry.affected_process = entry.affected_processes[0]
  }
  const controlFeatures = parseList(form.control_for.featuresInput)
  if (form.control_role || controlFeatures.length || form.control_for.acquisition_modalities.length || form.control_for.notes) {
    entry.control_role = form.control_role
    entry.control_for = {
      features: controlFeatures,
      acquisition_modalities: form.control_for.acquisition_modalities || [],
      notes: form.control_for.notes || ''
    }
  }
  if (form.classified_as.length) {
    entry.classified_as = form.classified_as.map((c) => ({
      id: c.id,
      label: c.label,
      domain: c.domain,
      source: c.source
    }))
  }
  const xref = {}
  XREF_KEYS.forEach((key) => {
    if (form.xref[key]) xref[key] = form.xref[key]
  })
  if (Object.keys(xref).length) entry.xref = xref
  return entry
}

function handleMechanismTargetSelect(value) {
  if (!value) return
  const id = getTermId(value)
  const label = getTermLabel(value)
  if (!id || !label) return
  const exists = form.mechanism.targets.some((t) => t.id === id)
  if (!exists) form.mechanism.targets.push({ id, label })
}

function removeMechanismTarget(index) {
  form.mechanism.targets.splice(index, 1)
}

function handleProcessSelect(value) {
  form.affectedProcessTerm = value || null
  const id = getTermId(form.affectedProcessTerm)
  const label = getTermLabel(form.affectedProcessTerm)
  if (!id || !label) return
  const exists = form.affectedProcesses.some((p) => p.id === id)
  if (!exists) {
    form.affectedProcesses.push({ id, label })
  }
  form.affectedProcessTerm = null
}

function removeAffectedProcess(index) {
  form.affectedProcesses.splice(index, 1)
}

function handleCrossrefSelect(value) {
  form.xrefTerm = value || null
  if (!value) {
    clearCrossrefKeys()
    return
  }
  const enumValue = (value?.ontologyEnum || value?.source || '').toLowerCase()
  const resolvedKey = CROSSREF_KEY_MAP[enumValue]
  clearCrossrefKeys()
  const identifier = getTermId(value)
  if (resolvedKey && form.xref[resolvedKey] !== undefined) {
    form.xref[resolvedKey] = identifier
  } else {
    form.xref.other = identifier
  }
}

function clearCrossrefKeys() {
  XREF_KEYS.forEach((key) => {
    form.xref[key] = ''
  })
}

function resolveInitialXrefTerm(xref = {}) {
  const priority = ['chebi', 'cl', 'cellosaurus', 'ncit', 'other']
  for (const key of priority) {
    const value = xref[key]
    if (typeof value === 'string' && value.trim()) {
      return {
        id: value.trim(),
        label: value.trim(),
        source: key,
        ontologyEnum: key
      }
    }
  }
  return null
}

function addClassification() {
  const term = form.classificationDraft.term || {}
  const id = getTermId(term)
  const label = getTermLabel(term)
  const domain = (form.classificationDraft.domain || '').trim()
  const source = (term.ontologyEnum || term.source || '').trim()
  if (!id || !label || !domain || !source) return
  form.classified_as.push({ id, label, domain, source })
  form.classificationDraft.term = null
  form.classificationDraft.domain = ''
  form.classificationDraft.role = ''
}

function removeClassification(index) {
  form.classified_as.splice(index, 1)
}

function getTermId(term) {
  if (!term) return ''
  if (typeof term === 'string') return term.trim()
  return (term.id || term.identifier || '').trim()
}

function getTermLabel(term) {
  if (!term) return ''
  if (typeof term === 'string') return term
  return term.label || term.prefLabel || term.identifier || ''
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="modelValue"
      class="material-drawer"
      role="dialog"
      aria-modal="true"
      @keydown.esc.stop.prevent="handleClose"
    >
      <div class="material-drawer__backdrop" @click.self="handleClose">
        <section class="material-drawer__panel">
          <header>
            <p class="drawer-eyebrow">{{ mode === 'edit' ? 'Library entry' : 'New material' }}</p>
            <h2>{{ drawerTitle }}</h2>
            <p class="drawer-subtitle">
              Materials are saved as concepts in <code>vocab/materials/</code> with immutable revisions in
              <code>vocab/material-revisions/</code>.
            </p>
          </header>

          <div v-if="errorMessages.length" class="drawer-errors">
            <p>Please fix the following:</p>
            <ul>
              <li v-for="err in errorMessages" :key="err">{{ err }}</li>
            </ul>
          </div>

          <form @submit.prevent="handleSubmit">
            <div class="field">
              <label>Label</label>
              <input v-model="form.label" type="text" placeholder="e.g., HepG2 cells" />
            </div>

            <div class="field">
              <label>Material ID</label>
              <input :value="currentId" type="text" readonly />
              <small>Automatic, read-only ID stored in plate layouts.</small>
            </div>

            <div class="field-grid">
              <div class="field">
                <label>Category</label>
                <select v-model="form.category">
                  <option value="" disabled>Select category…</option>
                  <option v-for="option in CATEGORY_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="field">
                <label>Experimental intents</label>
                <div class="chips">
                  <label v-for="opt in INTENT_OPTIONS" :key="opt" class="chip">
                    <input v-model="form.experimentalIntents" type="checkbox" :value="opt" />
                    {{ opt }}
                  </label>
                </div>
              </div>
            </div>

            <div class="field">
              <label>Additional tags</label>
              <input v-model="form.extraTags" type="text" placeholder="comma-separated, e.g., cell_line, sample" />
            </div>

            <div class="field">
              <label>Synonyms</label>
              <textarea v-model="form.synonymsText" rows="2" placeholder="One per line" />
            </div>

            <div class="field-grid">
              <div class="field">
                <label>Default role</label>
                <select v-model="form.defaultsRole">
                  <option value="">None</option>
                  <option v-for="role in roleOptions" :key="role.role || role" :value="role.role || role">
                    {{ role.label || role.role || role }}
                  </option>
                </select>
              </div>
              <div class="field">
                <label>Default amount</label>
                <div class="split">
                  <input v-model="form.amountValue" type="number" step="any" placeholder="Value" />
                  <input v-model="form.amountUnit" type="text" placeholder="Unit" />
                </div>
              </div>
            </div>

            <div v-if="isSample" class="section">
              <div class="section__header">
                <h4>Classified as</h4>
              </div>
              <div class="field-grid">
                <OntologyFieldInput
                  class="ontology-picker"
                  :value="form.classificationDraft.term"
                  vocab="materials"
                  placeholder="Search ontology term"
                  :search-options="{ domain: form.classificationDraft.domain, skipLocal: true, skipCache: true }"
                  :show-selection-badge="false"
                  disable-cache
                  @update:value="(val) => (form.classificationDraft.term = val)"
                />
                <div class="split">
                  <select v-model="form.classificationDraft.domain">
                    <option value="">domain…</option>
                    <option value="taxon">taxon</option>
                    <option value="cell_line">cell_line</option>
                    <option value="tissue">tissue</option>
                  </select>
                  <button class="ghost tiny" type="button" :disabled="!form.classificationDraft.term || !form.classificationDraft.domain" @click="addClassification">
                    Add
                  </button>
                </div>
              </div>
              <ul v-if="form.classified_as.length" class="classification-list">
                <li v-for="(row, idx) in form.classified_as" :key="`${row.id}-${idx}`" class="classification-pill">
                  <span class="pill-label">{{ row.label }}</span>
                  <span class="pill-meta">{{ row.domain }} · {{ row.source }}</span>
                  <button class="ghost tiny" type="button" @click="removeClassification(idx)">×</button>
                </li>
              </ul>
              <div v-else class="muted">No classifications.</div>
            </div>

            <div v-if="isTreatment" class="section">
              <div class="section__header">
                <h4>Mechanism</h4>
              </div>
              <div class="field-grid">
                <label>
                  Type
                  <select v-model="form.mechanism.type">
                    <option value="">Select type…</option>
                    <option v-for="opt in MECHANISM_TYPES" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                </label>
                <label>
                  Target (ontology search)
                  <OntologyFieldInput
                    class="ontology-picker"
                    :value="null"
                    :vocab="TARGET_VOCAB"
                    placeholder="Search target term"
                    :search-options="{ skipLocal: true, skipCache: true }"
                    :show-selection-badge="false"
                    disable-cache
                    @update:value="handleMechanismTargetSelect"
                  />
                </label>
              </div>
              <ul v-if="form.mechanism.targets.length" class="classification-list">
                <li v-for="(target, idx) in form.mechanism.targets" :key="`${target.id}-${idx}`" class="classification-pill">
                  <span class="pill-label">{{ target.label }}</span>
                  <span class="pill-meta">{{ target.id }}</span>
                  <button class="ghost tiny" type="button" @click="removeMechanismTarget(idx)">×</button>
                </li>
              </ul>
              <div v-else class="muted">No targets.</div>

              <div class="section__header">
                <h4>Affected processes</h4>
              </div>
              <div class="field-grid">
                <OntologyFieldInput
                  class="ontology-picker"
                  :value="form.affectedProcessTerm"
                  :vocab="PROCESS_VOCAB"
                  placeholder="Search GO process"
                  :search-options="{ ontology: 'GO', skipLocal: true, skipCache: true }"
                  :show-selection-badge="false"
                  disable-cache
                  @update:value="handleProcessSelect"
                />
                <div class="split">
                  <span class="muted">Select and add</span>
                  <button class="ghost tiny full-width" type="button" :disabled="!canAddProcess" @click="handleProcessSelect(form.affectedProcessTerm)">
                    Add process
                  </button>
                </div>
              </div>
              <ul v-if="form.affectedProcesses.length" class="classification-list">
                <li v-for="(process, idx) in form.affectedProcesses" :key="`${process.id}-${idx}`" class="classification-pill">
                  <span class="pill-label">{{ process.label }}</span>
                  <span class="pill-meta">{{ process.id }}</span>
                  <button class="ghost tiny" type="button" @click="removeAffectedProcess(idx)">×</button>
                </li>
              </ul>
              <div v-else class="muted">No affected processes.</div>
            </div>

            <div v-if="isAssay" class="section">
              <div class="section__header">
                <h4>Assay material features</h4>
              </div>
              <div class="field-grid">
                <label>
                  Measures (feature IDs)
                  <input v-model="form.measures" type="text" placeholder="feature:ros_proxy, feature:mmp_proxy" />
                </label>
                <label>
                  Detection modality
                  <select v-model="form.detection.modality">
                    <option value="">Select modality…</option>
                    <option v-for="opt in ACQUISITION_MODALITIES" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                </label>
              </div>
              <div class="field-grid">
                <label>
                  Channel hint
                  <input v-model="form.detection.channel_hint" type="text" placeholder="e.g., texas_red" />
                </label>
                <label>
                  Excitation (nm)
                  <input v-model="form.detection.excitation_nm" type="number" min="0" step="1" />
                </label>
                <label>
                  Emission (nm)
                  <input v-model="form.detection.emission_nm" type="number" min="0" step="1" />
                </label>
              </div>
            </div>

            <div v-if="isControl" class="section">
              <div class="section__header">
                <h4>Control</h4>
              </div>
              <div class="field-grid">
                <label>
                  Control role
                  <select v-model="form.control_role">
                    <option value="">Select role…</option>
                    <option value="positive">positive</option>
                    <option value="negative">negative</option>
                    <option value="vehicle">vehicle</option>
                  </select>
                </label>
                <label>
                  Acquisition modalities
                  <div class="chips">
                    <label v-for="opt in ACQUISITION_MODALITIES" :key="opt" class="chip">
                      <input v-model="form.control_for.acquisition_modalities" type="checkbox" :value="opt" />
                      {{ opt }}
                    </label>
                  </div>
                </label>
              </div>
              <label>
                Control features (feature IDs)
                <input v-model="form.control_for.featuresInput" type="text" placeholder="feature:intracellular_ros_proxy" />
              </label>
              <label>
                Notes
                <textarea v-model="form.control_for.notes" rows="2" placeholder="Optional notes"></textarea>
              </label>
            </div>

            <div class="section">
              <div class="section__header">
                <h4>Cross references</h4>
              </div>
              <div class="field-grid">
                <OntologyFieldInput
                  class="ontology-picker"
                  :value="form.xrefTerm"
                  :vocab="CROSSREF_VOCAB"
                  placeholder="Search CHEBI, CL, Cellosaurus, or NCIT"
                  :value-shape="'reference'"
                  :show-selection-badge="false"
                  disable-cache
                  @update:value="handleCrossrefSelect"
                />
                <div class="split">
                  <span class="muted">Selected IDs populate xref keys.</span>
                  <button class="ghost tiny" type="button" @click="clearCrossrefKeys">Clear</button>
                </div>
              </div>
            </div>

            <footer class="drawer-footer">
              <button class="ghost" type="button" @click="handleClose">Cancel</button>
              <button class="primary" type="submit" :disabled="saving || !canSave">
                {{ saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create material' }}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.material-drawer {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.material-drawer__backdrop {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.material-drawer__panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  width: min(960px, 96vw);
  max-height: 94vh;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
}
.drawer-eyebrow {
  margin: 0;
  color: #475569;
  font-size: 0.9rem;
}
.drawer-subtitle {
  margin: 4px 0 0;
  color: #475569;
}
.drawer-errors {
  border: 1px solid #fca5a5;
  background: #fef2f2;
  color: #b91c1c;
  padding: 8px;
  border-radius: 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
  align-items: flex-end;
}
.split {
  display: flex;
  gap: 6px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid #cbd5f5;
  border-radius: 12px;
  background: #fff;
  font-size: 0.9rem;
}
.section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}
.section__header h4 {
  margin: 0 0 4px 0;
}
.classification-list {
  list-style: none;
  padding: 0;
  margin: 6px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.classification-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 4px 8px;
  background: #f8fafc;
}
.pill-label {
  font-weight: 600;
}
.pill-meta {
  font-size: 0.85rem;
  color: #475569;
}
.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.muted {
  color: #94a3b8;
}
.ghost {
  border: 1px solid #cbd5f5;
  background: transparent;
  padding: 6px 10px;
  border-radius: 8px;
}
.ghost.tiny {
  padding: 4px 8px;
  font-size: 0.85rem;
}
.primary {
  background: #2563eb;
  color: #fff;
  border: 1px solid #2563eb;
  padding: 8px 12px;
  border-radius: 8px;
}
textarea,
input,
select {
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.4rem 0.6rem;
  font-size: 0.95rem;
}
</style>
