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

const MECHANISM_TYPES = ['agonist', 'antagonist', 'activator', 'inhibitor', 'inducer', 'suppressor', 'other']
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
  modelValue: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: 'create'
  },
  entry: {
    type: Object,
    default: () => null
  },
  seedLabel: {
    type: String,
    default: ''
  },
  seedTags: {
    type: Array,
    default: () => []
  },
  roleOptions: {
    type: Array,
    default: () => []
  },
  existingIds: {
    type: Array,
    default: () => []
  },
  saving: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'cancel', 'save'])

const form = reactive({
  label: '',
  category: '',
  extraTags: '',
  synonymsText: '',
  defaultsRole: '',
  amountValue: '',
  amountUnit: '',
  measures: '',
  mechanismType: '',
  mechanismTargetTerm: null,
  affectedProcessTerm: null,
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

const drawerTitle = computed(() =>
  props.mode === 'edit' ? 'Edit material details' : 'Create material'
)

const currentId = computed(() => {
  if (props.mode === 'edit' && props.entry?.id) {
    return props.entry.id
  }
  const base = form.label || props.seedLabel || 'material'
  return generateUniqueMaterialId(base, props.existingIds, { skipId: props.entry?.id })
})

const roleOptions = computed(() => props.roleOptions || [])

const parsedTags = computed(() => {
  const bucket = new Set()
  if (form.category) bucket.add(form.category)
  parseTagsInput(form.extraTags).forEach((tag) => bucket.add(tag))
  return Array.from(bucket)
})

const canSave = computed(() => {
  return Boolean(form.label.trim() && parsedTags.value.length)
})

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
  form.category = pickCategory(entry.tags) || deriveCategoryFromSeed() || ''
  const sourceTags =
    (Array.isArray(entry.tags) && entry.tags.length ? entry.tags : props.seedTags) || []
  form.extraTags = formatExtraTags(sourceTags, form.category)
  form.synonymsText = Array.isArray(entry.synonyms) ? entry.synonyms.join('\n') : ''
  form.defaultsRole = entry.defaults?.role || ''
  form.amountValue = entry.defaults?.amount?.value ?? ''
  form.amountUnit = entry.defaults?.amount?.unit ?? ''
  form.measures = entry.measures || ''
  form.mechanismType = entry.mechanism?.type || ''
  form.mechanismTargetTerm = entry.mechanism?.target?.id
    ? {
        id: entry.mechanism.target.id,
        label: entry.mechanism.target.label || entry.mechanism.target.id
      }
    : null
  form.affectedProcessTerm = entry.affected_process?.id
    ? {
        id: entry.affected_process.id,
        label: entry.affected_process.label || entry.affected_process.id
      }
    : null
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

function handleClose() {
  emit('update:modelValue', false)
  emit('cancel')
}

function handleSubmit() {
  const errors = []
  if (!form.label.trim()) {
    errors.push('Label is required.')
  }
  if (!parsedTags.value.length) {
    errors.push('Choose a category or add at least one tag.')
  }
  if ((form.amountValue && !form.amountUnit) || (!form.amountValue && form.amountUnit)) {
    errors.push('Amount requires both value and unit.')
  } else if (form.amountValue && form.amountUnit) {
    const numeric = Number(form.amountValue)
    if (!Number.isFinite(numeric)) {
      errors.push('Amount value must be numeric.')
    }
  }
  const hasMechanismType = Boolean(form.mechanismType)
  const hasMechanismTarget = Boolean(getTermId(form.mechanismTargetTerm))
  if (hasMechanismType || hasMechanismTarget) {
    if (!hasMechanismType || !hasMechanismTarget) {
      errors.push('Mechanism entries must include both a type and a selected target.')
    }
  }
  errorMessages.value = errors
  if (errors.length) return
  const payload = buildEntryPayload()
  emit('save', payload)
}

function buildEntryPayload() {
  const entry = {
    id: currentId.value,
    label: form.label.trim(),
    tags: parsedTags.value
  }
  const synonyms = parseSynonymsInput(form.synonymsText)
  if (synonyms.length) {
    entry.synonyms = synonyms
  }
  if (form.measures.trim()) {
    entry.measures = form.measures.trim()
  }
  if (form.defaultsRole || (form.amountValue && form.amountUnit)) {
    entry.defaults = {}
    if (form.defaultsRole) {
      entry.defaults.role = form.defaultsRole
    }
    if (form.amountValue && form.amountUnit) {
      entry.defaults.amount = {
        value: Number(form.amountValue),
        unit: form.amountUnit
      }
    }
  }
  const targetId = getTermId(form.mechanismTargetTerm)
  const targetLabel = getTermLabel(form.mechanismTargetTerm)
  if (form.mechanismType && targetId && targetLabel) {
    entry.mechanism = {
      type: form.mechanismType,
      target: {
        id: targetId,
        label: targetLabel
      }
    }
  }
  const processId = getTermId(form.affectedProcessTerm)
  const processLabel = getTermLabel(form.affectedProcessTerm)
  if (processId && processLabel) {
    entry.affected_process = {
      id: processId,
      label: processLabel
    }
  }
  const xref = {}
  XREF_KEYS.forEach((key) => {
    if (form.xref[key]) {
      xref[key] = form.xref[key]
    }
  })
  if (Object.keys(xref).length) {
    entry.xref = xref
  }
  return entry
}

function handleMechanismTargetSelect(value) {
  form.mechanismTargetTerm = value || null
}

function handleProcessSelect(value) {
  form.affectedProcessTerm = value || null
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
              Materials are saved to <code>vocab/materials.lab.yaml</code> so the picker can reuse them.
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
                <label>Additional tags</label>
                <input
                  v-model="form.extraTags"
                  type="text"
                  placeholder="comma-separated, e.g., cell_line, sample"
                />
              </div>
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
                  <option
                    v-for="role in roleOptions"
                    :key="role.role || role"
                    :value="role.role || role"
                  >
                    {{ role.label || role.role || role }}
                  </option>
                </select>
              </div>
              <div class="field">
                <label>Default amount</label>
                <div class="amount-inputs">
                  <input v-model="form.amountValue" type="number" step="any" placeholder="Value" />
                  <input v-model="form.amountUnit" type="text" placeholder="Unit" />
                </div>
              </div>
            </div>

            <div class="field">
              <label>Measures / feature</label>
              <input
                v-model="form.measures"
                type="text"
                placeholder="feature:thiol_reduction_state_proxy"
              />
            </div>

    <div class="field-grid">
      <div class="field">
        <label>Mechanism type</label>
        <select v-model="form.mechanismType">
          <option value="">None</option>
          <option v-for="kind in MECHANISM_TYPES" :key="kind" :value="kind">
            {{ kind }}
          </option>
        </select>
      </div>
      <div class="field field--wide">
        <label>Mechanism target</label>
        <OntologyFieldInput
          :value="form.mechanismTargetTerm"
          :vocab="TARGET_VOCAB"
          placeholder="Search NCIt targets (local-first)"
          @update:value="handleMechanismTargetSelect"
        />
        <small v-if="form.mechanismTargetTerm">Selected: {{ form.mechanismTargetTerm.label }}</small>
      </div>
    </div>

    <div class="field">
      <label>Affected process (optional)</label>
      <OntologyFieldInput
        :value="form.affectedProcessTerm"
        :vocab="PROCESS_VOCAB"
        placeholder="Search GO processes"
        @update:value="handleProcessSelect"
      />
      <small v-if="form.affectedProcessTerm">Selected: {{ form.affectedProcessTerm.label }}</small>
    </div>

    <div class="field">
      <label>External ontology reference</label>
      <OntologyFieldInput
        :value="form.xrefTerm"
        :vocab="CROSSREF_VOCAB"
        placeholder="Search CHEBI, CL, Cellosaurus, or NCIT"
        value-shape="reference"
        @update:value="handleCrossrefSelect"
      />
      <small v-if="form.xrefTerm">Selected: {{ form.xrefTerm.label }}</small>
      <button
        v-if="form.xrefTerm"
        type="button"
        class="ghost tiny"
        @click="handleCrossrefSelect(null)"
      >
        Clear reference
      </button>
    </div>

            <footer class="drawer-actions">
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
  z-index: 40;
}

.material-drawer__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  justify-content: flex-end;
}

.material-drawer__panel {
  width: min(480px, 100%);
  height: 100%;
  background: #fff;
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

header h2 {
  margin: 0.1rem 0;
}

.drawer-eyebrow {
  margin: 0;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: #64748b;
  letter-spacing: 0.05em;
}

.drawer-subtitle {
  font-size: 0.85rem;
  color: #475569;
}

.drawer-errors {
  border: 1px solid #fecaca;
  background: #fef2f2;
  border-radius: 8px;
  padding: 0.75rem;
  color: #991b1b;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

label {
  font-weight: 600;
  color: #0f172a;
}

input,
select,
textarea {
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font-size: 0.95rem;
}

.field-grid {
  display: grid;
  gap: 0.75rem;
}

@media (min-width: 720px) {
  .field-grid {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
}
.field--wide {
  grid-column: span 2;
}

.amount-inputs {
  display: flex;
  gap: 0.35rem;
}

.amount-inputs input {
  flex: 1;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.primary,
.ghost {
  border-radius: 999px;
  padding: 0.45rem 1rem;
  font-weight: 600;
  cursor: pointer;
}

.primary {
  background: #2563eb;
  color: #fff;
  border: none;
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ghost {
  border: 1px solid #cbd5f5;
  background: transparent;
  color: #0f172a;
}

small {
  color: #64748b;
}
</style>
