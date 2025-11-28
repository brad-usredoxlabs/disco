<script setup>
import { computed } from 'vue'

const DEFAULT_DOMAINS = ['taxon', 'cell_line', 'tissue', 'pathway', 'phenotype', 'compound', 'other']
const DEFAULT_ROLES = [
  'sample',
  'target',
  'positive_control',
  'negative_control',
  'reference',
  'spike_in',
  'background',
  'assay_material',
  'other'
]
const DEFAULT_ONTOLOGIES = ['ncbitaxon', 'uberon', 'cl', 'pato', 'reactome', 'cellosaurus', 'chebi', 'go', 'other']

const props = defineProps({
  value: {
    type: Array,
    default: () => []
  },
  inherited: {
    type: Array,
    default: () => []
  },
  label: {
    type: String,
    default: 'Biological Entities'
  },
  helpText: {
    type: String,
    default: ''
  },
  readOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:value'])

const domainOptions = computed(() => DEFAULT_DOMAINS)
const roleOptions = computed(() => DEFAULT_ROLES)
const ontologyOptions = computed(() => DEFAULT_ONTOLOGIES)
const localEntities = computed(() => normalizeEntities(props.value))
const inheritedEntities = computed(() => normalizeEntities(props.inherited))

function normalizeEntities(list) {
  if (!Array.isArray(list)) return []
  return list.map((entry) => ({
    domain: entry?.domain || '',
    role: entry?.role || '',
    ontology: entry?.ontology || '',
    '@id': entry?.['@id'] || '',
    label: entry?.label || ''
  }))
}

function updateEntry(index, key, val) {
  const next = localEntities.value.slice()
  next[index] = {
    ...(next[index] || {}),
    [key]: val
  }
  emit('update:value', next)
}

function addEntity() {
  emit('update:value', [
    ...localEntities.value,
    { domain: '', role: '', ontology: '', '@id': '', label: '' }
  ])
}

function removeEntity(index) {
  const next = localEntities.value.slice()
  next.splice(index, 1)
  emit('update:value', next)
}

function chipLabel(entity) {
  const domain = entity.domain || 'domain?'
  const role = entity.role || 'role?'
  const label = entity.label || entity['@id'] || 'unnamed'
  return `${domain} · ${role} · ${label}`
}
</script>

<template>
  <div class="biology-entities-field">
    <header class="field-header">
      <div>
        <p class="field-label">{{ label }}</p>
        <p v-if="helpText" class="field-help">{{ helpText }}</p>
      </div>
      <button class="secondary" type="button" @click="addEntity" :disabled="readOnly">
        Add entity
      </button>
    </header>

    <div class="entity-summary">
      <div v-if="localEntities.length" class="chip-row">
        <span class="chip-label">Local</span>
        <span v-for="(entity, index) in localEntities" :key="`local-${index}`" class="entity-chip">
          {{ chipLabel(entity) }}
        </span>
      </div>
      <div v-if="inheritedEntities.length" class="chip-row chip-row--inherited">
        <span class="chip-label">Inherited</span>
        <span v-for="(entity, index) in inheritedEntities" :key="`inherited-${index}`" class="entity-chip entity-chip--inherited">
          {{ chipLabel(entity) }}
        </span>
      </div>
      <p v-if="!localEntities.length && !inheritedEntities.length" class="empty-state">
        No biological entities yet. Click “Add entity” to start.
      </p>
    </div>

    <div v-for="(entity, index) in localEntities" :key="`editor-${index}`" class="entity-row">
      <div class="entity-fields">
        <label>
          Domain
          <select :value="entity.domain" @input="updateEntry(index, 'domain', $event.target.value)" :disabled="readOnly">
            <option value="" disabled>Select domain</option>
            <option v-for="option in domainOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label>
          Role
          <select :value="entity.role" @input="updateEntry(index, 'role', $event.target.value)" :disabled="readOnly">
            <option value="" disabled>Select role</option>
            <option v-for="option in roleOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label>
          Ontology
          <select :value="entity.ontology" @input="updateEntry(index, 'ontology', $event.target.value)" :disabled="readOnly">
            <option value="" disabled>Select ontology</option>
            <option v-for="option in ontologyOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label>
          Identifier
          <input type="text" :value="entity['@id']" @input="updateEntry(index, '@id', $event.target.value)" :disabled="readOnly" />
        </label>
        <label>
          Label
          <input type="text" :value="entity.label" @input="updateEntry(index, 'label', $event.target.value)" :disabled="readOnly" />
        </label>
      </div>
      <button class="text-button" type="button" @click="removeEntity(index)" :disabled="readOnly">Remove</button>
    </div>
  </div>
</template>

<style scoped>
.biology-entities-field {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  background: #fff;
}

.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.field-label {
  font-weight: 600;
  margin: 0;
}

.field-help {
  color: #64748b;
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
}

.entity-summary {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.chip-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
}

.entity-chip {
  background: #e0f2fe;
  color: #0369a1;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.8rem;
}

.chip-row--inherited .chip-label {
  color: #a0aec0;
}

.entity-chip--inherited {
  background: #f1f5f9;
  color: #94a3b8;
}

.empty-state {
  color: #94a3b8;
  font-style: italic;
}

.entity-row {
  border-top: 1px solid #e2e8f0;
  padding-top: 0.75rem;
  margin-top: 0.75rem;
}

.entity-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.5rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
  color: #475569;
}

select,
input {
  border: 1px solid #cbd5f5;
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
}

.text-button {
  margin-top: 0.5rem;
  color: #dc2626;
  background: transparent;
  border: none;
  cursor: pointer;
}

.text-button:disabled,
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
