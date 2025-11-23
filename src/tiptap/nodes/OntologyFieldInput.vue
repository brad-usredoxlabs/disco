<template>
  <div class="ontology-field">
    <div class="ontology-display" v-if="currentLabel">
      <span class="ontology-text">{{ currentLabel }}</span>
      <span v-if="currentValue?.source" class="ontology-source">{{ currentValue.source }}</span>
      <button type="button" class="ontology-clear" @click="clearSelection" title="Clear selection">
        ×
      </button>
    </div>
    <input
      ref="inputRef"
      type="text"
      class="ontology-input"
      :placeholder="placeholder"
      v-model="query"
      @focus="handleFocus"
      @input="handleInput"
      @keydown.down.prevent="highlightNext"
      @keydown.up.prevent="highlightPrev"
      @keydown.enter.prevent="selectHighlighted"
      @keydown.tab="selectHighlighted"
    />
    <div class="ontology-dropdown" v-if="dropdownOpen">
      <p v-if="!query" class="dropdown-hint">Type to search ontology terms…</p>
      <p v-else-if="isLoading" class="dropdown-hint">Searching…</p>
      <p v-else-if="errorMessage" class="dropdown-error">{{ errorMessage }}</p>
      <ul v-else>
        <li
          v-for="(result, index) in results"
          :key="result.id + index"
          :class="{ 'is-active': index === highlightedIndex }"
          @mousedown.prevent="selectResult(result)"
        >
          <div class="result-line">
            <strong>{{ result.label || result.id }}</strong>
            <span class="result-source">{{ result.source }}</span>
          </div>
          <p v-if="result.definition" class="result-definition">{{ result.definition }}</p>
        </li>
        <li v-if="!results.length" class="dropdown-hint">No matches found.</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { searchOntologyTerms, saveOntologySelection } from '../../ontology/service'

const props = defineProps({
  value: {
    type: [Object, String],
    default: null
  },
  placeholder: {
    type: String,
    default: ''
  },
  vocab: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:value'])

const query = ref('')
const results = ref([])
const isLoading = ref(false)
const dropdownOpen = ref(false)
const highlightedIndex = ref(0)
const errorMessage = ref('')
const inputRef = ref(null)
let searchHandle = null

const currentValue = computed(() => {
  if (!props.value) return null
  if (typeof props.value === 'string') {
    return { id: props.value, label: props.value }
  }
  return props.value
})

const currentLabel = computed(() => currentValue.value?.label || currentValue.value?.id || '')

watch(
  () => props.value,
  (val) => {
    if (!dropdownOpen.value) {
      query.value = val?.label || val?.id || ''
    }
  },
  { immediate: true }
)

function handleFocus() {
  dropdownOpen.value = true
  if (!query.value && currentLabel.value) {
    query.value = currentLabel.value
  }
  scheduleSearch()
}

function handleInput() {
  dropdownOpen.value = true
  scheduleSearch()
}

function scheduleSearch() {
  if (!props.vocab) return
  if (searchHandle) {
    clearTimeout(searchHandle)
  }
  searchHandle = setTimeout(runSearch, 250)
}

async function runSearch() {
  if (!props.vocab || !query.value.trim()) {
    results.value = []
    return
  }
  isLoading.value = true
  errorMessage.value = ''
  try {
    const data = await searchOntologyTerms(props.vocab, query.value)
    results.value = data
    highlightedIndex.value = 0
  } catch (err) {
    errorMessage.value = err?.message || 'Search failed.'
    results.value = []
  } finally {
    isLoading.value = false
  }
}

function selectResult(result) {
  dropdownOpen.value = false
  query.value = result.label || result.id
  emitSelection(result)
}

function emitSelection(result) {
  if (!result) return
  const payload = {
    id: result.id,
    label: result.label || result.id,
    source: result.source || '',
    definition: result.definition || ''
  }
  emit('update:value', payload)
  saveOntologySelection(props.vocab, payload)
}

function clearSelection() {
  emit('update:value', null)
  query.value = ''
  dropdownOpen.value = false
}

function highlightNext() {
  if (!results.value.length) return
  highlightedIndex.value = (highlightedIndex.value + 1) % results.value.length
}

function highlightPrev() {
  if (!results.value.length) return
  highlightedIndex.value =
    highlightedIndex.value - 1 < 0 ? results.value.length - 1 : highlightedIndex.value - 1
}

function selectHighlighted(event) {
  if (!dropdownOpen.value || !results.value.length) return
  selectResult(results.value[highlightedIndex.value])
  if (event?.type === 'keydown' && event.key === 'Tab') {
    event.preventDefault()
  }
}

onBeforeUnmount(() => {
  if (searchHandle) {
    clearTimeout(searchHandle)
    searchHandle = null
  }
})
</script>

<style scoped>
.ontology-field {
  position: relative;
  width: 100%;
}

.ontology-display {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
  margin-bottom: 0.15rem;
}

.ontology-text {
  font-weight: 600;
}

.ontology-source {
  font-size: 0.75rem;
  color: #475569;
}

.ontology-clear {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: #94a3b8;
}

.ontology-input {
  border: none;
  border-bottom: 1px dotted #cbd5f5;
  width: 100%;
  font-size: 0.95rem;
  padding: 0.2rem 0.25rem;
  background: transparent;
}

.ontology-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.ontology-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  z-index: 20;
  max-height: 240px;
  overflow: auto;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.15);
}

.ontology-dropdown ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ontology-dropdown li {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
}

.ontology-dropdown li:last-child {
  border-bottom: none;
}

.ontology-dropdown li.is-active {
  background: #e0f2fe;
}

.dropdown-hint {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  color: #475569;
}

.dropdown-error {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  color: #b91c1c;
}

.result-line {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.result-source {
  font-size: 0.75rem;
  color: #475569;
}

.result-definition {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: #475569;
}
</style>
