<template>
  <div class="ontology-list">
    <div class="ontology-list-row" v-for="(entry, index) in state" :key="index">
      <div class="ontology-row-content">
        <OntologyFieldInput
          class="ontology-cell"
          :value="entry"
          :vocab="vocab"
          placeholder="Search term"
          :disabled="readOnly"
          :show-selection-badge="false"
          value-shape="reference"
          :search-options="buildSearchOptions(entry)"
          :ref="(instance) => setFieldRef(instance, index)"
          @update:value="(val) => updateEntry(index, val)"
        />
        <template v-for="column in normalizedColumns" :key="column.key">
          <label class="ontology-extra">
            <span class="extra-label">{{ column.label }}</span>
            <EnumCombobox
              v-if="column.type === 'enum'"
              :model-value="entry[column.key]"
              :options="column.enum || []"
              :placeholder="column.placeholder || column.label"
              :disabled="readOnly"
              @update:model-value="(val) => updateColumnValue(index, column.key, val)"
            />
            <input
              v-else
              type="text"
              :value="entry[column.key]"
              :placeholder="column.placeholder || column.label"
              :readonly="readOnly"
              :disabled="readOnly"
              @input="(event) => updateColumnValue(index, column.key, event.target.value)"
            />
          </label>
        </template>
      </div>
      <button
        v-if="!readOnly"
        type="button"
        class="ontology-remove"
        @click="removeEntry(index)"
        @keydown.enter.prevent="removeEntry(index)"
        @keydown.space.prevent="removeEntry(index)"
      >
        ×
      </button>
    </div>
    <button v-if="!readOnly" type="button" class="ontology-add" @click="addEntry">+ Add entry</button>
  </div>
</template>

<script setup>
import { reactive, watch, computed, nextTick } from 'vue'
import OntologyFieldInput from './OntologyFieldInput.vue'
import EnumCombobox from '../../components/fields/EnumCombobox.vue'

const props = defineProps({
  value: {
    type: [Array, null],
    default: null
  },
  vocab: {
    type: String,
    default: ''
  },
  columns: {
    type: Array,
    default: () => []
  },
  readOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:value'])

const normalizedColumns = computed(() =>
  (Array.isArray(props.columns) ? props.columns : [])
    .filter((column) => column && column.key)
    .map((column) => ({
      ...column,
      type: column.type || (Array.isArray(column.enum) && column.enum.length ? 'enum' : 'text'),
      placeholder: column.placeholder || column.label || ''
    }))
)

const state = reactive(normalizeList(props.value))
const fieldRefs = []
fieldRefs.length = state.length

watch(
  () => props.value,
  (val) => {
    const next = normalizeList(val)
    state.splice(0, state.length, ...next)
    fieldRefs.length = next.length
  }
)

function normalizeList(value) {
  if (!Array.isArray(value) || !value.length) {
    return [createEmptyEntry()]
  }
  return value.map((entry) => {
    const normalized = coerceReferenceEntry(entry)
    const next = {
      ...(typeof entry === 'object' && entry ? entry : {}),
      ...normalized
    }
    normalizedColumns.value.forEach((column) => {
      if (!Object.prototype.hasOwnProperty.call(next, column.key)) {
        next[column.key] = ''
      }
    })
    return next
  })
}

function createEmptyEntry() {
  const entry = { id: '', label: '', source: '' }
  normalizedColumns.value.forEach((column) => {
    entry[column.key] = column.default ?? ''
  })
  return entry
}

function updateEntry(index, payload) {
  const normalized = coerceReferenceEntry(payload)
  state[index] = {
    ...state[index],
    ...normalized
  }
  emitValue()
}

async function addEntry() {
  state.push(createEmptyEntry())
  emitValue()
  await nextTick()
  focusField(state.length - 1)
}

function removeEntry(index) {
  state.splice(index, 1)
  fieldRefs.splice(index, 1)
  if (!state.length) {
    state.push(createEmptyEntry())
  }
  emitValue()
}

function emitValue() {
  const filtered = state
    .filter((entry) => entry?.id || entry?.label)
    .map((entry) => ({ ...entry }))
  emit('update:value', filtered.length ? filtered : [])
}

function updateColumnValue(index, key, value) {
  if (!state[index]) return
  state[index][key] = value ?? ''
  emitValue()
}

function buildSearchOptions(entry) {
  const domain = typeof entry?.domain === 'string' ? entry.domain.trim() : ''
  const ontology = typeof entry?.source === 'string' && entry.source.trim()
  const fallbackOntology = !ontology && typeof entry?.ontology === 'string' ? entry.ontology.trim() : ''
  return {
    domain,
    ontology: ontology || fallbackOntology || ''
  }
}

function setFieldRef(instance, index) {
  if (!instance) return
  fieldRefs[index] = instance
}

function focusField(index) {
  const target = fieldRefs[index]
  if (target && typeof target.focus === 'function') {
    target.focus()
  }
}

function coerceReferenceEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return { id: '', label: '', source: '' }
  }
  return {
    id: entry.id || entry.identifier || '',
    label: entry.label || entry.identifier || '',
    source: entry.source || entry.ontology || ''
  }
}
</script>

<style scoped>
.ontology-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ontology-list-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.35rem;
  align-items: center;
  width: 100%;
}

.ontology-cell {
  width: 100%;
}

.ontology-extra {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.extra-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}

.ontology-extra input {
  border: 1px solid #cbd5f5;
  border-radius: 6px;
  padding: 0.25rem 0.4rem;
}

.ontology-extra :deep(.enum-input) {
  border: 1px solid #cbd5f5;
  border-radius: 6px;
  padding: 0.25rem 0.4rem;
  width: 100%;
}

.ontology-remove {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.1rem 0.4rem;
  justify-self: end;
}

.ontology-row-content {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  width: 100%;
}

.ontology-add {
  align-self: flex-start;
  border: 1px dashed #94a3b8;
  border-radius: 999px;
  padding: 0.2rem 0.8rem;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
}
</style>
