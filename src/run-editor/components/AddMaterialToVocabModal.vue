<template>
  <div v-if="open" class="modal">
    <div class="modal__card">
      <header class="modal__header">
        <h3>Add material to local vocab</h3>
        <p class="modal__hint">Save ontology hits into /vocab/materials.lab.yaml</p>
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
            Category
            <select v-model="form.category">
              <option v-for="opt in categoryOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </label>
          <label>
            Intents
            <div class="chips">
              <label v-for="opt in intentOptions" :key="opt" class="chip">
                <input v-model="form.intents" type="checkbox" :value="opt" />
                {{ opt }}
              </label>
            </div>
          </label>
        </div>

        <label>
          Tags (comma-separated)
          <input v-model="form.tagsInput" type="text" placeholder="ppara, agonist, fire" />
        </label>

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

        <div class="section">
          <div class="section__header">
            <h4>Classified as</h4>
          </div>
          <div class="grid two-col">
            <OntologyFieldInput
              class="ontology-picker"
              :value="classificationDraft.term"
              vocab="materials.lab"
              placeholder="Search ontology term"
              :search-options="{ domain: classificationDraft.domain, skipLocal: true }"
              :show-selection-badge="false"
              @update:value="(val) => (classificationDraft.term = val)"
            />
            <div class="split">
              <select v-model="classificationDraft.domain">
                <option value="">domain…</option>
                <option v-for="opt in domainOptions" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <button class="ghost tiny" type="button" :disabled="!canAddClassification" @click="addClassification">
                Add
              </button>
            </div>
          </div>
          <div v-if="!form.classified_as.length" class="muted">No classifications.</div>
          <ul v-else class="classification-list">
            <li v-for="row in form.classified_as" :key="row.key" class="classification-pill">
              <span class="pill-label">{{ row.label }}</span>
              <span class="pill-meta">{{ row.source }} · {{ row.domain }}</span>
              <button class="ghost tiny" type="button" @click="removeClassification(row.key)">×</button>
            </li>
          </ul>
        </div>

        <div class="section">
          <div class="section__header">
            <h4>Mechanism</h4>
          </div>
          <div class="grid two-col">
            <label>
              Type
              <select v-model="mechanismDraft.type">
                <option value="">Select type…</option>
                <option v-for="opt in mechanismTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </label>
            <label>
              Target (ontology search)
              <OntologyFieldInput
                class="ontology-picker"
                :value="mechanismDraft.term"
                vocab="materials.lab"
                placeholder="Search target term"
                :search-options="{ skipLocal: true }"
                :show-selection-badge="false"
                @update:value="(val) => (mechanismDraft.term = val)"
              />
            </label>
          </div>
          <div class="grid two-col">
            <label>
              Target label (optional override)
              <input v-model="mechanismDraft.labelOverride" type="text" placeholder="Optional display label" />
            </label>
            <label>
              <span class="muted">Add target</span>
              <button class="ghost tiny full-width" type="button" :disabled="!canAddTarget" @click="addTarget">
                Add target
              </button>
            </label>
          </div>
          <div v-if="!form.mechanism.targets.length" class="muted">No targets.</div>
          <ul v-else class="classification-list">
            <li v-for="target in form.mechanism.targets" :key="target.key" class="classification-pill">
              <span class="pill-label">{{ target.label }}</span>
              <span class="pill-meta">{{ target.id }}</span>
              <button class="ghost tiny" type="button" @click="removeTarget(target.key)">×</button>
            </li>
          </ul>
        </div>

        <div class="section">
          <div class="section__header">
            <h4>Affected process</h4>
          </div>
          <div class="grid two-col">
            <OntologyFieldInput
              class="ontology-picker"
              :value="processDraft.term"
              vocab="materials.lab"
              placeholder="Search GO process"
              :search-options="{ ontology: 'GO', skipLocal: true }"
              :show-selection-badge="false"
              @update:value="(val) => (processDraft.term = val)"
            />
            <div class="split">
              <span class="muted">Select and add</span>
              <button class="ghost tiny full-width" type="button" :disabled="!canSetProcess" @click="setAffectedProcess">
                Add process
              </button>
            </div>
          </div>
          <div v-if="form.affected_process?.id" class="classification-list">
            <div class="classification-pill">
              <span class="pill-label">{{ form.affected_process.label }}</span>
              <span class="pill-meta">{{ form.affected_process.id }}</span>
              <button class="ghost tiny" type="button" @click="clearAffectedProcess">×</button>
            </div>
          </div>
          <div v-else class="muted">No affected process selected.</div>
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
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import OntologyFieldInput from '../../tiptap/nodes/OntologyFieldInput.vue'
import { ensureMaterialId } from '../../plate-editor/utils/materialId'

const CATEGORY_OPTIONS = ['compound', 'dye', 'cell_line', 'media', 'solvent', 'buffer', 'other']
const INTENT_OPTIONS = [
  'treatment',
  'assay_material',
  'positive_control',
  'negative_control',
  'vehicle_control',
  'sample',
  'other'
]
const DOMAIN_OPTIONS = ['taxon', 'cell_line', 'tissue', 'role', 'mechanism', 'compound']
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
  }
})

const emit = defineEmits(['cancel', 'save'])

const form = reactive(buildEmptyForm())
const classificationDraft = reactive({
  term: null,
  domain: ''
})
const mechanismDraft = reactive({
  term: null,
  type: '',
  labelOverride: ''
})
const processDraft = reactive({
  term: null
})

const categoryOptions = computed(() => CATEGORY_OPTIONS)
const intentOptions = computed(() => INTENT_OPTIONS)
const domainOptions = computed(() => DOMAIN_OPTIONS)
const mechanismTypeOptions = computed(() => MECHANISM_TYPES)
const canAddClassification = computed(() => {
  const term = classificationDraft.term
  const domain = classificationDraft.domain?.trim()
  return Boolean(term && (term.id || term.identifier) && domain)
})
const canAddTarget = computed(() => {
  const term = mechanismDraft.term
  const type = mechanismDraft.type?.trim()
  return Boolean(term && (term.id || term.identifier) && type)
})
const canSetProcess = computed(() => {
  const term = processDraft.term
  return Boolean(term && (term.id || term.identifier))
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

function resetForm(term) {
  const next = buildEmptyForm()
  classificationDraft.term = null
  classificationDraft.domain = ''
  mechanismDraft.term = null
  mechanismDraft.type = ''
  mechanismDraft.labelOverride = ''
  processDraft.term = null
  if (term) {
    const label = term.label || term.prefLabel || term.id || ''
    const ontologyKey = term.ontologyEnum || term.ontology || term.source || ''
    next.label = label
    next.id = ensureMaterialId(term.id || label || '')
    next.category = 'compound'
    next.intents = ['treatment']
    next.tagsInput = ''
    if (ontologyKey && term.id) {
      next.xrefKey = ontologyKey
      next.xrefValue = term.id
    }
  }
  Object.assign(form, next)
}

function buildEmptyForm() {
  return {
    id: '',
    label: '',
    category: 'compound',
    intents: [],
    tagsInput: '',
    xrefKey: '',
    xrefValue: '',
    classified_as: [],
    mechanism: {
      type: '',
      targets: []
    },
    affected_process: {
      id: '',
      label: ''
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

function addTarget() {
  const term = mechanismDraft.term || {}
  const id = term.identifier || term.id || ''
  const label = mechanismDraft.labelOverride?.trim() || term.label || term.prefLabel || id
  const type = mechanismDraft.type?.trim()
  if (!id || !type) return
  form.mechanism.type = type
  form.mechanism.targets.push({
    key: `tgt-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    id,
    label
  })
  mechanismDraft.term = null
  mechanismDraft.labelOverride = ''
}

function removeTarget(key) {
  form.mechanism.targets = form.mechanism.targets.filter((row) => row.key !== key)
}

function setAffectedProcess() {
  const term = processDraft.term || {}
  const id = term.identifier || term.id || ''
  const label = term.label || term.prefLabel || id
  if (!id) return
  form.affected_process = { id, label }
  processDraft.term = null
}

function clearAffectedProcess() {
  form.affected_process = { id: '', label: '' }
  processDraft.term = null
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
    intents: Array.isArray(form.intents) ? form.intents.filter(Boolean) : [],
    tags,
    xref,
    classified_as: form.classified_as.map((row) => ({
      id: row.id,
      label: row.label,
      domain: row.domain,
      source: row.source
    })),
    mechanism: {
      type: form.mechanism.type?.trim(),
      targets: form.mechanism.targets
        .map((row) => ({
          id: row.id?.trim(),
          label: row.label?.trim()
        }))
        .filter((row) => row.id && row.label)
    },
    affected_process: form.affected_process.id && form.affected_process.label
      ? {
          id: form.affected_process.id.trim(),
          label: form.affected_process.label.trim()
        }
      : null
  }
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
</style>
