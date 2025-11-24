<template>
  <div class="ontology-list">
    <div class="ontology-list-row" v-for="(entry, index) in state" :key="index">
      <OntologyFieldInput
        class="ontology-cell"
        :value="entry"
        :vocab="vocab"
        placeholder="Search term"
        :disabled="readOnly"
        @update:value="(val) => updateEntry(index, val)"
      />
      <template v-for="column in resolvedColumns" :key="column.key">
        <input
          class="ontology-extra"
          type="text"
          v-model="entry[column.key]"
          :placeholder="column.label"
          :readonly="readOnly"
          :disabled="readOnly"
          @input="emitValue"
        />
      </template>
      <button v-if="!readOnly" type="button" class="ontology-remove" @click="removeEntry(index)">×</button>
    </div>
    <button v-if="!readOnly" type="button" class="ontology-add" @click="addEntry">+ Add entry</button>
  </div>
</template>

<script setup>
import { reactive, watch, computed } from 'vue'
import OntologyFieldInput from './OntologyFieldInput.vue'

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

console.log('[OntologyListField] Mounted with', { vocab: props.vocab, value: props.value })

const resolvedColumns = computed(() => {
  if (props.columns?.length) return props.columns
  return [
    { key: 'notes', label: 'Notes' }
  ]
})

const state = reactive(normalizeList(props.value))

watch(
  () => props.value,
  (val) => {
    const next = normalizeList(val)
    state.splice(0, state.length, ...next)
  }
)

function normalizeList(value) {
  if (!Array.isArray(value) || !value.length) {
    return [createEmptyEntry()]
  }
  return value.map((entry) => ({ ...entry }))
}

function createEmptyEntry() {
  const entry = { id: '', label: '', source: '' }
  resolvedColumns.value.forEach((column) => {
    entry[column.key] = ''
  })
  return entry
}

function updateEntry(index, payload) {
  state[index] = {
    ...state[index],
    ...payload
  }
  emitValue()
}

function addEntry() {
  state.push(createEmptyEntry())
  emitValue()
}

function removeEntry(index) {
  state.splice(index, 1)
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
</script>

<style scoped>
.ontology-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ontology-list-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.ontology-cell {
  flex: 2 1 240px;
}

.ontology-extra {
  flex: 1 1 140px;
  border: 1px solid #cbd5f5;
  border-radius: 6px;
  padding: 0.25rem 0.4rem;
}

.ontology-remove {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  color: #94a3b8;
  cursor: pointer;
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
