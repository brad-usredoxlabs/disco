<template>
  <div class="ontology-field">
    <div class="ontology-display" v-if="currentLabel">
      <span class="ontology-text">{{ currentLabel }}</span>
      <span v-if="currentValue?.source" class="ontology-source">{{ currentValue.source }}</span>
      <button
        v-if="!disabled"
        type="button"
        class="ontology-clear"
        @click="clearSelection"
        title="Clear selection"
      >
        ×
      </button>
    </div>
    <input
      ref="inputRef"
      type="text"
      class="ontology-input"
      :class="{ 'is-disabled': disabled }"
      :placeholder="placeholder"
      v-model="query"
      :readonly="disabled"
      :disabled="disabled"
      @focus="handleFocus"
      @input="handleInput"
      @keydown.down.prevent="highlightNext"
      @keydown.up.prevent="highlightPrev"
      @keydown.enter.prevent="selectHighlighted"
      @keydown.tab="selectHighlighted"
    />
    <div class="ontology-dropdown" v-if="dropdownOpen && !disabled">
      <p v-if="isLoading" class="dropdown-hint">Searching…</p>
      <p v-else-if="errorMessage" class="dropdown-error">{{ errorMessage }}</p>
      <ul v-else-if="results.length">
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
      </ul>
      <p v-else class="dropdown-hint">Type to search ontology terms…</p>
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
  },
  disabled: {
    type: Boolean,
    default: false
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
  if (props.disabled) return
  dropdownOpen.value = true
  if (!query.value && currentLabel.value) {
    query.value = currentLabel.value
  }
  scheduleSearch()
}

function handleInput() {
  if (props.disabled) return
  dropdownOpen.value = true
  scheduleSearch()
}

function scheduleSearch() {
  if (!props.vocab) {
    errorMessage.value = 'No vocabulary configured.'
    results.value = []
    return
  }
  if (searchHandle) {
    clearTimeout(searchHandle)
  }
  searchHandle = setTimeout(runSearch, 250)
}

async function runSearch() {
  console.log('[OntologyFieldInput] runSearch called', { 
    vocab: props.vocab, 
    query: query.value,
    hasVocab: !!props.vocab
  })
  
  if (!props.vocab) {
    console.warn('[OntologyFieldInput] No vocab prop!')
    results.value = []
    return
  }
  isLoading.value = true
  errorMessage.value = ''
  try {
    const data = await searchOntologyTerms(props.vocab, query.value || '')
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
  if (props.disabled) return
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

.ontology-input {
  border: none;
  border-bottom: 1px dotted #cbd5f5;
  width: 100%;
  font-size: 0.95rem;
  padding: 0.2rem 0.25rem;
  background: transparent;
}

.ontology-input.is-disabled {
  border-bottom-style: solid;
  border-bottom-color: #e2e8f0;
  cursor: not-allowed;
}
</style>
