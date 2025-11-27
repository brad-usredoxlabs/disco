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
          :ref="(instance) => setFieldRef(instance, index)"
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
  return []
})

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
