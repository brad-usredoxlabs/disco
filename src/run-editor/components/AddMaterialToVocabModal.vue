<template>
  <div v-if="open" class="modal">
    <div class="modal__card">
      <header class="modal__header">
        <h3>Add material to local vocab</h3>
        <p class="modal__hint">Saves material concept + revision into /vocab/materials/ and /vocab/material-revisions/</p>
      </header>

      <div class="modal__body">
        <div class="grid two-col">
          <label>
            ID
            <input v-model="form.id" type="text" />
          </label>
          <label>
            Label
            <input v-model="form.label" type="text" />
          </label>
        </div>

        <div class="grid two-col">
          <label>
            Xref key
            <input v-model="form.xrefKey" type="text" placeholder="CHEBI, NCIT, GO…" readonly disabled />
          </label>
          <label>
            Xref value
            <input
              v-model="form.xrefValue"
              type="text"
              :placeholder="term?.id || 'CURIE or URL'"
              readonly
              disabled
            />
          </label>
        </div>

        <label>
          Tags (comma-separated)
          <input v-model="form.tagsInput" type="text" placeholder="ppara, agonist, fire" />
        </label>

        <label>
          Vendor (optional)
          <select v-model="form.vendor_slug">
            <option v-for="opt in vendorOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label>
          Catalog numbers (optional)
          <div class="split">
            <input
              v-model="catalogInput"
              type="text"
              placeholder="e.g., 12345-10G"
              @keydown.enter.prevent="handleCatalogAdd"
            />
            <button class="ghost tiny" type="button" @click="handleCatalogAdd">
              Add
            </button>
          </div>
          <div class="chips">
            <span v-for="cat in form.catalog_numbers" :key="cat" class="pill-label">
              {{ cat }}
              <button class="ghost tiny" type="button" @click="removeCatalogNumber(cat)">×</button>
            </span>
          </div>
        </label>

        <div class="grid two-col">
          <label>
            Category
            <select v-model="form.category">
              <option v-for="opt in categoryOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </label>
        </div>

        <div class="intent-section">
          <div class="section__header">
            <h4>Experimental intents</h4>
          </div>
          <div class="intent-form">
            <div class="intent-tabs">
              <button
                v-for="opt in intentOptions"
                :key="opt"
                type="button"
                class="intent-tab"
                :class="{ active: intentDraft.kind === opt }"
                @click="intentDraft.kind = opt"
              >
                {{ opt }}
              </button>
            </div>

            <div v-if="intentDraft.kind === 'treatment'" class="intent-fields">
              <div class="grid two-col">
                <label>
                  Mechanism type
                  <select v-model="intentDraft.fields.mechanism.type">
                    <option value="">Select type…</option>
                    <option v-for="opt in mechanismTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                </label>
                <label>
                  Target (ontology search)
                  <OntologyFieldInput
                    class="ontology-picker"
                    :value="intentDraft.fields.mechanism.targetTerm"
                    vocab="materials"
                    placeholder="Search target term"
                    :search-options="{ skipLocal: true, skipCache: true }"
                    :show-selection-badge="false"
                    disable-cache
                    @update:value="(val) => (intentDraft.fields.mechanism.targetTerm = val)"
                  />
                </label>
              </div>
              <div class="grid two-col">
                <label>
                  Target label (optional override)
                  <input v-model="intentDraft.fields.mechanism.labelOverride" type="text" placeholder="Optional display label" />
                </label>
                <label>
                  <span class="muted">Add target</span>
                  <button
                    class="ghost tiny full-width"
                    type="button"
                    :disabled="!canAddIntentTarget"
                    @click="addIntentTarget"
                  >
                    Add target
                  </button>
                </label>
              </div>
              <div v-if="!intentDraft.fields.mechanism.targets.length" class="muted tiny">No targets.</div>
              <ul v-else class="classification-list">
                <li v-for="target in intentDraft.fields.mechanism.targets" :key="target.key" class="classification-pill">
                  <span class="pill-label">{{ target.label }}</span>
                  <span class="pill-meta">{{ target.id }}</span>
                  <button class="ghost tiny" type="button" @click="removeIntentTarget(target.key)">×</button>
                </li>
              </ul>

              <div class="grid two-col">
                <label>
                  Affected process
                  <OntologyFieldInput
                    class="ontology-picker"
                    :value="intentDraft.fields.affected_process.term"
                    vocab="materials"
                    placeholder="Search GO process"
                    :search-options="{ ontology: 'GO', skipLocal: true, skipCache: true }"
                    :show-selection-badge="false"
                    disable-cache
                    @update:value="(val) => (intentDraft.fields.affected_process.term = val)"
                  />
                </label>
                <label>
                  <span class="muted">Add process</span>
                  <button
                    class="ghost tiny full-width"
                    type="button"
                    :disabled="!canAddIntentProcess"
                    @click="addIntentProcess"
                  >
                    Add process
                  </button>
                </label>
              </div>
              <div v-if="intentDraft.fields.affected_process.id" class="classification-list">
                <div class="classification-pill">
                  <span class="pill-label">{{ intentDraft.fields.affected_process.label }}</span>
                  <span class="pill-meta">{{ intentDraft.fields.affected_process.id }}</span>
                  <button class="ghost tiny" type="button" @click="clearIntentProcess">×</button>
                </div>
              </div>
            </div>

            <div v-else-if="intentDraft.kind === 'assay_material'" class="intent-fields">
              <div class="grid two-col">
                <label>
              <span>Measures (feature IDs)</span>
              <div class="split">
                <EnumCombobox
                  :model-value="measureInput"
                  :options="featureOptionIds"
                  placeholder="Select or type feature…"
                  @update:model-value="handleMeasureSelect"
                />
                <div class="combo-actions">
                  <button class="ghost tiny" type="button" @click="intentDraft.fields.measures = []">Clear</button>
                  <button class="ghost tiny" type="button" @click="openFeatureModal('measure')">Add feature</button>
                </div>
              </div>
              <div class="chips">
                <span v-for="feat in intentDraft.fields.measures" :key="feat" class="pill-label">
                  {{ feat }}
                  <button class="ghost tiny" type="button" @click="removeIntentMeasure(feat)">×</button>
                    </span>
                  </div>
                </label>
                <label>
                  Detection modality
                  <select v-model="intentDraft.fields.detection.modality">
                    <option value="">Select modality…</option>
                    <option v-for="opt in acquisitionModalities" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                </label>
              </div>
              <div class="grid two-col">
                <label>
                  Channel hint
                  <input v-model="intentDraft.fields.detection.channel_hint" type="text" placeholder="e.g. texas_red" />
                </label>
                <label>
                  Excitation (nm)
                  <input v-model="intentDraft.fields.detection.excitation_nm" type="number" min="0" step="1" />
                </label>
                <label>
                  Emission (nm)
                  <input v-model="intentDraft.fields.detection.emission_nm" type="number" min="0" step="1" />
                </label>
              </div>
            </div>

            <div v-else-if="intentDraft.kind === 'control'" class="intent-fields">
              <div class="grid two-col">
                <label>
                  Control role
                  <select v-model="intentDraft.fields.control_role">
                    <option value="">Select role…</option>
                    <option value="positive">positive</option>
                    <option value="negative">negative</option>
                    <option value="vehicle">vehicle</option>
                  </select>
                </label>
                <label>
                  Acquisition modalities
                  <div class="chips">
                    <label v-for="opt in acquisitionModalities" :key="opt" class="chip">
                      <input v-model="intentDraft.fields.control_for.acquisition_modalities" type="checkbox" :value="opt" />
                      {{ opt }}
                    </label>
                  </div>
                </label>
              </div>
              <label>
              Control features (feature IDs)
              <div class="split">
                <EnumCombobox
                  :model-value="controlFeatureInput"
                  :options="featureOptionIds"
                  placeholder="Select or type feature…"
                  @update:model-value="handleControlFeatureSelect"
                />
                <div class="combo-actions">
                  <button class="ghost tiny" type="button" @click="intentDraft.fields.control_for.features = []">Clear</button>
                  <button class="ghost tiny" type="button" @click="openFeatureModal('control')">Add feature</button>
                </div>
              </div>
              <div class="chips">
                  <span v-for="feat in intentDraft.fields.control_for.features" :key="feat" class="pill-label">
                    {{ feat }}
                    <button class="ghost tiny" type="button" @click="removeIntentControlFeature(feat)">×</button>
                  </span>
                </div>
              </label>
              <label>
                Control notes
                <input v-model="intentDraft.fields.control_for.notes" type="text" placeholder="Optional notes" />
              </label>
            </div>

            <div v-else-if="intentDraft.kind === 'sample'" class="intent-fields">
              <div class="grid two-col">
                <label>
                  Classification (ontology search)
                  <OntologyFieldInput
                    class="ontology-picker"
                    :value="classificationDraft.term"
                    vocab="materials"
                    placeholder="Search ontology term"
                    :search-options="{ domain: classificationDraft.domain, skipLocal: true, skipCache: true }"
                    :show-selection-badge="false"
                    disable-cache
                    @update:value="(val) => (classificationDraft.term = val)"
                  />
                </label>
                <label>
                  Domain
                  <div class="split">
                    <select v-model="classificationDraft.domain">
                      <option value="">Select domain…</option>
                      <option v-for="opt in domainOptions" :key="opt" :value="opt">{{ opt }}</option>
                    </select>
                    <button class="ghost tiny" type="button" :disabled="!canAddClassification" @click="addClassification">
                      Add
                    </button>
                  </div>
                </label>
              </div>
              <div v-if="!form.classified_as.length" class="muted">No classifications added yet.</div>
              <ul v-else class="classification-list">
                <li v-for="row in form.classified_as" :key="row.key" class="classification-pill">
                  <span class="pill-label">{{ row.label }}</span>
                  <span class="pill-meta">{{ row.source }} · {{ row.domain }}</span>
                  <button class="ghost tiny" type="button" @click="removeClassification(row.key)">×</button>
                </li>
              </ul>
            </div>

            <div v-else-if="intentDraft.kind === 'other'" class="intent-fields">
              <div class="placeholder-content">
                <p class="muted">General intent type. Use this for custom or uncategorized experimental intents.</p>
              </div>
            </div>

            <div class="intent-actions">
              <p v-if="intentValidationError" class="error">{{ intentValidationError }}</p>
              <button class="ghost-button" type="button" @click="resetIntentDraft">Clear</button>
              <button class="primary" type="button" :disabled="!canAddIntent" @click="addIntentEntry">
                Add intent
              </button>
            </div>
          </div>

          <div v-if="intentEntries.length" class="intent-list">
            <div v-for="entry in intentEntries" :key="entry.id" class="intent-card">
              <div class="intent-card__header">
                <strong>{{ entry.kind }}</strong>
                <div class="intent-card__actions">
                  <button class="ghost tiny" type="button" @click="editIntent(entry.id)">Edit</button>
                  <button class="ghost tiny" type="button" @click="removeIntent(entry.id)">Remove</button>
                </div>
              </div>
              <ul class="intent-card__summary">
                <li v-if="entry.kind === 'treatment' && entry.fields.mechanism.type">
                  Mechanism: {{ entry.fields.mechanism.type }} ({{ entry.fields.mechanism.targets.length }} targets)
                </li>
                <li v-if="entry.kind === 'treatment' && entry.fields.affected_process.id">
                  Process: {{ entry.fields.affected_process.label || entry.fields.affected_process.id }}
                </li>
                <li v-if="entry.kind === 'assay_material' && entry.fields.measures.length">
                  Measures: {{ entry.fields.measures.join(', ') }}
                </li>
                <li v-if="entry.kind === 'control' && entry.fields.control_role">
                  Control role: {{ entry.fields.control_role }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <footer class="modal__footer">
        <button class="ghost-button" type="button" @click="$emit('cancel')">Cancel</button>
        <button class="primary" type="button" :disabled="saving" @click="handleSave">
          {{ saving ? 'Saving…' : 'Save to vocab' }}
        </button>
      </footer>
    </div>
  </div>
  <AddFeatureModal
    :open="featureModal.open"
    :saving="featureModal.saving"
    :error="featureModal.error"
    :preset="featureModal.preset"
    @cancel="closeFeatureModal"
    @save="handleFeatureSave"
  />
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import OntologyFieldInput from '../../tiptap/nodes/OntologyFieldInput.vue'
import EnumCombobox from '../../components/fields/EnumCombobox.vue'
import AddFeatureModal from './AddFeatureModal.vue'
import { ensureMaterialId, slugifyMaterialId } from '../../plate-editor/utils/materialId'
import { writeFeatureConcept, writeFeatureRevision, rebuildFeatureIndex } from '../../vocab/featureWriter'
import { useRepoConnection } from '../../fs/repoConnection'

const CATEGORY_OPTIONS = ['reagent', 'medium', 'solvent', 'buffer', 'additive', 'waste', 'other']
const INTENT_OPTIONS = ['control', 'sample', 'treatment', 'assay_material', 'other']
const DOMAIN_OPTIONS = ['taxon', 'cell_line', 'tissue']
const ACQUISITION_MODALITIES = ['fluorescence', 'absorbance', 'luminescence', 'microscopy', 'ms', 'qpcr', 'other']
const MECHANISM_TYPES = [
  'agonist',
  'antagonist',
  'inhibitor',
  'activator',
  'inducer',
  'blocker',
  'uncoupler',
  'modulator',
  'other'
]

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  term: {
    type: Object,
    default: null
  },
  saving: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  features: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['cancel', 'save'])

const repo = useRepoConnection()
const form = reactive(buildEmptyForm())
const classificationDraft = reactive({
  term: null,
  domain: ''
})
const catalogInput = ref('')
const intentIdCounter = ref(0)
const measureInput = ref('')
const controlFeatureInput = ref('')

const categoryOptions = computed(() => CATEGORY_OPTIONS)
const intentOptions = computed(() => INTENT_OPTIONS)
const intentEntries = ref([])
const intentDraft = reactive(buildEmptyIntentDraft())
const domainOptions = computed(() => DOMAIN_OPTIONS)
const mechanismTypeOptions = computed(() => MECHANISM_TYPES)
const acquisitionModalities = computed(() => ACQUISITION_MODALITIES)
const localFeatures = ref([])
const featureOptions = computed(() => localFeatures.value)
const featureOptionIds = computed(() => featureOptions.value.map((f) => f.id).filter(Boolean))
const featureModal = reactive({
  open: false,
  saving: false,
  error: '',
  preset: {},
  returnTo: ''
})
const isSample = computed(() => form.experimental_intents.includes('sample'))
const vendorOptions = computed(() => [
  { value: '', label: 'Unknown / internal' },
  { value: 'thermo', label: 'Thermo Fisher' },
  { value: 'sigmaaldrich', label: 'Sigma-Aldrich' },
  { value: 'biorad', label: 'Bio-Rad' },
  { value: 'thomas', label: 'Thomas' },
  { value: 'internal', label: 'Internal' },
  { value: 'unknown', label: 'Unknown' }
])
const canAddClassification = computed(() => {
  const term = classificationDraft.term
  const domain = classificationDraft.domain?.trim()
  return Boolean(term && (term.id || term.identifier) && domain)
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm(props.term)
    }
  }
)

watch(
  () => props.term,
  (term) => {
    if (props.open) {
      resetForm(term)
    }
  }
)

watch(
  () => props.features,
  (list = []) => {
    localFeatures.value = Array.isArray(list) ? [...list] : []
  },
  { immediate: true, deep: true }
)

function resetForm(term) {
  const next = buildEmptyForm()
  classificationDraft.term = null
  classificationDraft.domain = ''
  intentEntries.value = []
  resetIntentDraft()
  if (term) {
    const label = term.label || term.prefLabel || term.id || ''
    next.label = label
    next.id = ensureMaterialId(label || term.id || '')
    next.category = 'reagent'
    next.experimental_intents = []
    next.tagsInput = ''
    if (term.id) {
      next.xrefKey = term.id
      next.xrefValue = label || term.id
    }
    next.vendor_slug = ''
    next.catalog_numbers = []
  }
  Object.assign(form, next)
}

function buildEmptyForm() {
  return {
    id: '',
    label: '',
    category: 'reagent',
    experimental_intents: [],
    tagsInput: '',
    xrefKey: '',
    xrefValue: '',
    vendor_slug: '',
    catalog_numbers: [],
    classified_as: [],
    mechanism: {
      type: '',
      targets: []
    },
    affected_process: {
      id: '',
      label: ''
    },
    measures: [],
  detection: {
    modality: '',
    channel_hint: '',
    excitation_nm: '',
    emission_nm: ''
  },
  control_role: '',
    control_for: {
      features: [],
      acquisition_modalities: [],
      notes: ''
    }
  }
}

function addClassification() {
  const term = classificationDraft.term || {}
  const id = term.identifier || term.id || ''
  const label = term.label || term.prefLabel || id
  const source = term.ontologyEnum || term.ontology || term.source || ''
  const domain = classificationDraft.domain?.trim() || ''
  if (!id || !label || !source || !domain) return
  const entry = {
    key: `cls-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    id,
    label,
    source,
    domain
  }
  form.classified_as.push(entry)
  classificationDraft.term = null
  classificationDraft.domain = ''
}

function removeClassification(key) {
  form.classified_as = form.classified_as.filter((row) => row.key !== key)
}

function buildEmptyIntentDraft() {
  return {
    kind: 'control',
    fields: {
      mechanism: { type: '', targets: [], targetTerm: null, labelOverride: '' },
      affected_process: { id: '', label: '', term: null },
      measures: [],
      detection: { modality: '', channel_hint: '', excitation_nm: '', emission_nm: '' },
      control_role: '',
      control_for: {
        features: [],
        acquisition_modalities: [],
        notes: ''
      }
    }
  }
}

function resetIntentDraft() {
  Object.assign(intentDraft, buildEmptyIntentDraft())
}

function addIntentTarget() {
  const term = intentDraft.fields.mechanism.targetTerm || {}
  const id = term.identifier || term.id || ''
  const label = intentDraft.fields.mechanism.labelOverride?.trim() || term.label || term.prefLabel || id
  if (!id || !label) return
  intentDraft.fields.mechanism.targets.push({
    key: `itgt-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    id,
    label
  })
  intentDraft.fields.mechanism.targetTerm = null
  intentDraft.fields.mechanism.labelOverride = ''
}

function removeIntentTarget(key) {
  intentDraft.fields.mechanism.targets = intentDraft.fields.mechanism.targets.filter((row) => row.key !== key)
}

function addIntentProcess() {
  const term = intentDraft.fields.affected_process.term || {}
  const id = term.identifier || term.id || ''
  const label = term.label || term.prefLabel || id
  if (!id && !label) return
  intentDraft.fields.affected_process = { id: id || label, label: label || id, term: null }
}

function clearIntentProcess() {
  intentDraft.fields.affected_process = { id: '', label: '', term: null }
}

function addIntentMeasure(featureId) {
  const val = (featureId || '').trim()
  if (!val) return
  if (!intentDraft.fields.measures.includes(val)) {
    intentDraft.fields.measures.push(val)
  }
}

function handleMeasureSelect(value) {
  measureInput.value = value
  // Only clear and add if it's a valid existing feature
  if (value && featureOptionIds.value.includes(value)) {
    addIntentMeasure(value)
    measureInput.value = ''
  }
}

function removeIntentMeasure(featureId) {
  intentDraft.fields.measures = intentDraft.fields.measures.filter((id) => id !== featureId)
}

function addIntentControlFeature(featureId) {
  const val = (featureId || '').trim()
  if (!val) return
  if (!intentDraft.fields.control_for.features.includes(val)) {
    intentDraft.fields.control_for.features.push(val)
  }
}

function handleControlFeatureSelect(value) {
  controlFeatureInput.value = value
  // Only clear and add if it's a valid existing feature
  if (value && featureOptionIds.value.includes(value)) {
    addIntentControlFeature(value)
    controlFeatureInput.value = ''
  }
}

function removeIntentControlFeature(featureId) {
  intentDraft.fields.control_for.features = intentDraft.fields.control_for.features.filter((id) => id !== featureId)
}

function openFeatureModal(context = '', term = null) {
  const labelDraft =
    (term && (term.label || term.prefLabel || term.id || term.identifier)) ||
    (context === 'measure' ? measureInput.value : controlFeatureInput.value) ||
    ''
  const generatedId = ensureFeatureId(labelDraft || (term?.id || term?.identifier || ''))
  featureModal.preset = {
    label: labelDraft,
    id: generatedId
  }
  featureModal.returnTo = context
  featureModal.error = ''
  featureModal.open = true
}

function closeFeatureModal() {
  featureModal.open = false
  featureModal.saving = false
  featureModal.error = ''
  featureModal.preset = {}
  featureModal.returnTo = ''
}

function ensureFeatureId(raw = '') {
  const base = String(raw || '')
    .replace(/^feature:/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
  const slug = base || 'feature'
  return `feature:${slug}`
}

async function handleFeatureSave(entry = {}) {
  if (!entry.label) {
    featureModal.error = 'Label is required.'
    return
  }
  if (!repo?.writeFile) {
    featureModal.error = 'Connect a repository to save features.'
    return
  }
  const id = entry.id ? ensureFeatureId(entry.id) : ensureFeatureId(entry.label)
  featureModal.saving = true
  featureModal.error = ''
  try {
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z')
    const conceptPayload = {
      ...entry,
      id,
      label: entry.label
    }
    await writeFeatureConcept(repo, conceptPayload, { timestamp })
    await writeFeatureRevision(repo, { ...entry, id, label: entry.label }, { timestamp, createdBy: 'user' })
    await rebuildFeatureIndex(repo)
    const option = { id, label: entry.label }
    localFeatures.value = [...localFeatures.value, option]
    if (featureModal.returnTo === 'measure') {
      handleMeasureSelect(id)
    } else if (featureModal.returnTo === 'control') {
      handleControlFeatureSelect(id)
    }
    closeFeatureModal()
  } catch (err) {
    featureModal.error = err?.message || 'Failed to save feature.'
  } finally {
    featureModal.saving = false
  }
}

function addIntentEntry() {
  if (!intentDraft.kind) return
  intentIdCounter.value += 1
  const id = `intent-${intentIdCounter.value}-${Date.now()}`
  intentEntries.value.push({
    id,
    kind: intentDraft.kind,
    fields: JSON.parse(JSON.stringify(intentDraft.fields))
  })
  // keep legacy flat intents in sync
  if (!form.experimental_intents.includes(intentDraft.kind)) {
    form.experimental_intents.push(intentDraft.kind)
  }
  resetIntentDraft()
}

function editIntent(id) {
  const entry = intentEntries.value.find((it) => it.id === id)
  if (!entry) return
  Object.assign(intentDraft, {
    kind: entry.kind,
    fields: JSON.parse(JSON.stringify(entry.fields))
  })
  removeIntent(id)
}

function removeIntent(id) {
  intentEntries.value = intentEntries.value.filter((it) => it.id !== id)
}

const canAddIntentTarget = computed(() => {
  const term = intentDraft.fields.mechanism.targetTerm
  const type = intentDraft.fields.mechanism.type?.trim()
  return Boolean(term && (term.id || term.identifier) && type)
})

const canAddIntentProcess = computed(() => {
  const term = intentDraft.fields.affected_process.term
  return Boolean(term && (term.id || term.identifier))
})

const intentValidationError = computed(() => {
  if (!intentDraft.kind) return ''
  
  if (intentDraft.kind === 'control') {
    if (!intentDraft.fields.control_role) {
      return 'Control intent requires a control role'
    }
    if (!intentDraft.fields.control_for.features.length) {
      return 'Control intent requires at least one feature ID'
    }
  }
  
  if (intentDraft.kind === 'treatment') {
    if (!intentDraft.fields.mechanism.type) {
      return 'Treatment intent requires a mechanism type'
    }
    if (!intentDraft.fields.mechanism.targets.length) {
      return 'Treatment intent requires at least one target'
    }
  }
  
  if (intentDraft.kind === 'assay_material') {
    if (!intentDraft.fields.measures.length) {
      return 'Assay material intent requires at least one measure (feature ID)'
    }
  }
  
  return ''
})

const canAddIntent = computed(() => {
  return intentDraft.kind && !intentValidationError.value
})

function addCatalogNumber(val) {
  const value = (val || '').trim()
  if (!value) return
  if (!form.catalog_numbers.includes(value)) {
    form.catalog_numbers.push(value)
  }
}

function removeCatalogNumber(value) {
  form.catalog_numbers = form.catalog_numbers.filter((entry) => entry !== value)
}

function handleCatalogAdd() {
  addCatalogNumber(catalogInput.value)
  catalogInput.value = ''
}

function handleSave() {
  const payload = buildPayload()
  emit('save', payload)
}

function buildPayload() {
  const tags = form.tagsInput
    .split(/[,\s]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
  const xref = {}
  if (form.xrefKey && form.xrefValue) {
    xref[form.xrefKey] = form.xrefValue
  }
  return {
    id: form.id ? ensureMaterialId(form.id) : '',
    label: form.label || '',
    category: form.category || 'other',
    experimental_intents: buildExperimentalIntents(),
    tags,
    xref,
    vendor_slug: form.vendor_slug || '',
    catalog_numbers: Array.isArray(form.catalog_numbers)
      ? form.catalog_numbers.map((val) => val.trim()).filter(Boolean)
      : [],
    classified_as: form.classified_as.map((row) => ({
      id: row.id,
      label: row.label,
      domain: row.domain,
      source: row.source
    })),
    ...buildIntentFieldPayload()
  }
}

function buildExperimentalIntents() {
  const kinds = intentEntries.value.map((entry) => entry.kind).filter(Boolean)
  const merged = Array.from(new Set([...(form.experimental_intents || []), ...kinds]))
  return merged
}

function buildIntentFieldPayload() {
  const latestByKind = {}
  intentEntries.value.forEach((entry) => {
    latestByKind[entry.kind] = entry
  })

  const payload = {
    mechanism: { type: '', targets: [] },
    affected_process: null,
    measures: [],
    detection: {
      modality: '',
      channel_hint: '',
      excitation_nm: '',
      emission_nm: ''
    },
    control_role: '',
    control_for: {
      features: [],
      acquisition_modalities: [],
      notes: ''
    }
  }

  const treatment = latestByKind.treatment
  if (treatment) {
    payload.mechanism.type = treatment.fields.mechanism.type || ''
    payload.mechanism.targets = (treatment.fields.mechanism.targets || []).map((row) => ({
      id: row.id?.trim(),
      label: row.label?.trim()
    })).filter((row) => row.id && row.label)
    if (treatment.fields.affected_process.id || treatment.fields.affected_process.label) {
      payload.affected_process = {
        id: (treatment.fields.affected_process.id || treatment.fields.affected_process.label || '').trim(),
        label: (treatment.fields.affected_process.label || treatment.fields.affected_process.id || '').trim()
      }
    }
  }

  const assay = latestByKind.assay_material
  if (assay) {
    payload.measures = Array.isArray(assay.fields.measures) ? assay.fields.measures.filter(Boolean) : []
    payload.detection = {
      modality: assay.fields.detection.modality || '',
      channel_hint: assay.fields.detection.channel_hint || '',
      excitation_nm: assay.fields.detection.excitation_nm || '',
      emission_nm: assay.fields.detection.emission_nm || ''
    }
  }

  const control = latestByKind.control
  if (control) {
    payload.control_role = control.fields.control_role || ''
    payload.control_for = {
      features: Array.isArray(control.fields.control_for.features)
        ? control.fields.control_for.features.filter(Boolean)
        : [],
      acquisition_modalities: Array.isArray(control.fields.control_for.acquisition_modalities)
        ? control.fields.control_for.acquisition_modalities.filter(Boolean)
        : [],
      notes: control.fields.control_for.notes || ''
    }
  }

  return payload
}

</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal__card {
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
.modal__header h3 {
  margin: 0;
}
.modal__hint {
  margin: 4px 0 0;
  color: #475569;
  font-size: 0.9rem;
}
.modal__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.grid {
  display: grid;
  gap: 8px;
}
.grid.two-col {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.grid.four-col {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  align-items: center;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-weight: 600;
  color: #0f172a;
}
input,
select {
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.4rem 0.6rem;
  font-size: 0.95rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  font-weight: 500;
}
.split {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: center;
}
.combo-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.section {
  border: 1px dashed #cbd5f5;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.muted {
  color: #64748b;
  font-size: 0.9rem;
}
.error {
  color: #b91c1c;
  margin: 0;
}
.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.primary {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 0.45rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ghost-button,
.ghost,
.ghost.tiny {
  border: 1px solid #cbd5f5;
  background: #f8fafc;
  border-radius: 10px;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
}
.ghost.tiny {
  padding: 0.15rem 0.45rem;
  font-size: 0.85rem;
}

.classification-list {
  list-style: none;
  padding: 0;
  margin: 0.35rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.classification-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  background: #f8fafc;
}

.pill-label {
  font-weight: 600;
  color: #0f172a;
}

.pill-meta {
  font-size: 0.8rem;
  color: #475569;
}

.full-width {
  width: 100%;
  justify-content: center;
}

.intent-section {
  border: 2px solid #8b5cf6;
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #faf5ff 0%, #f8f8ff 100%);
}

.intent-section .section__header h4 {
  margin: 0;
  color: #6b21a8;
  font-size: 1.05rem;
}

.intent-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intent-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  border-bottom: 2px solid #e9d5ff;
  padding-bottom: 8px;
}

.intent-tab {
  padding: 0.5rem 1rem;
  border: 1px solid #cbd5f5;
  border-radius: 8px 8px 0 0;
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: capitalize;
}

.intent-tab:hover {
  background: #e9d5ff;
  border-color: #a855f7;
  color: #6b21a8;
}

.intent-tab.active {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  border-color: #7c3aed;
  color: white;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
}

.intent-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 320px;
  height: 320px;
  padding: 12px 0;
  overflow-y: auto;
}

.placeholder-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.placeholder-content p {
  max-width: 400px;
  line-height: 1.6;
}

.intent-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #e9d5ff;
}

.intent-actions .error {
  margin: 0;
  flex: 1;
  text-align: left;
}

.intent-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.intent-card {
  border: 1px solid #e9d5ff;
  border-radius: 8px;
  padding: 10px;
  background: white;
}

.intent-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.intent-card__header strong {
  color: #6b21a8;
  text-transform: capitalize;
  font-size: 0.95rem;
}

.intent-card__actions {
  display: flex;
  gap: 6px;
}

.intent-card__summary {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.intent-card__summary li {
  color: #475569;
  font-size: 0.85rem;
}
</style>
