<template>
  <div class="ontology-field">
    <div class="ontology-display" v-if="props.showSelectionBadge && currentLabel">
      <span class="ontology-text">{{ currentLabel }}</span>
      <span v-if="currentSource" class="ontology-source">{{ currentSource }}</span>
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
      @blur="handleBlur"
      @input="handleInput"
      @keydown.down.prevent="highlightNext"
      @keydown.up.prevent="highlightPrev"
      @keydown.enter.prevent="selectHighlighted"
      @keydown.tab="handleTab"
    />
    <div class="ontology-dropdown" v-if="dropdownOpen && !disabled" ref="dropdownRef">
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
            <span class="result-source">
              {{ formatIdentifier(result.id) }}
            </span>
          </div>
          <p v-if="result.definition" class="result-definition">{{ result.definition }}</p>
        </li>
      </ul>
      <p v-else class="dropdown-hint">Type to search ontology terms…</p>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
  },
  showSelectionBadge: {
    type: Boolean,
    default: true
  },
  valueShape: {
    type: String,
    default: 'term',
    validator: (input) => ['term', 'reference'].includes(input)
  },
  searchOptions: {
    type: Object,
    default: () => ({})
  },
  autofocusAfterSelect: {
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
const dropdownRef = ref(null)
let searchHandle = null
let blurHandle = null

const valueShape = computed(() => (props.valueShape === 'reference' ? 'reference' : 'term'))

const currentValue = computed(() => {
  if (!props.value) return null
  if (typeof props.value === 'string') {
    return valueShape.value === 'reference'
      ? { id: props.value, label: props.value, source: '' }
      : { identifier: props.value, label: props.value, ontology: '' }
  }
  if (typeof props.value !== 'object') return null
  const identifier = props.value.identifier || props.value.id || props.value['@id'] || ''
  const label = props.value.label || props.value.prefLabel || props.value.name || identifier
  const ontology = props.value.ontology || props.value.source || ''
  if (valueShape.value === 'reference') {
    return {
      id: identifier || label,
      label,
      source: ontology || '',
      definition: props.value.definition || ''
    }
  }
  return {
    identifier: identifier || '',
    label,
    ontology,
    definition: props.value.definition || '',
    synonyms: Array.isArray(props.value.synonyms) ? props.value.synonyms : [],
    xrefs: Array.isArray(props.value.xrefs) ? props.value.xrefs : []
  }
})

const currentSource = computed(() => currentValue.value?.ontology || currentValue.value?.source || '')
const currentLabel = computed(
  () => currentValue.value?.label || currentValue.value?.identifier || currentValue.value?.id || ''
)

watch(
  () => props.value,
  (val) => {
    if (!dropdownOpen.value) {
      query.value = val?.label || val?.identifier || val?.id || ''
    }
  },
  { immediate: true }
)

watch(
  () => JSON.stringify(props.searchOptions || {}),
  () => {
    if (dropdownOpen.value && !props.disabled) {
      scheduleSearch()
    }
  }
)

function handleFocus() {
  if (props.disabled) return
  cancelBlur()
  dropdownOpen.value = true
  if (!query.value && currentLabel.value) {
    query.value = currentLabel.value
  }
  scheduleSearch()
}

function handleInput() {
  if (props.disabled) return
  cancelBlur()
  dropdownOpen.value = true
  scheduleSearch()
}

function handleBlur() {
  if (props.disabled) return
  cancelBlur()
  blurHandle = setTimeout(() => {
    dropdownOpen.value = false
    blurHandle = null
  }, 120)
}

function cancelBlur() {
  if (blurHandle) {
    clearTimeout(blurHandle)
    blurHandle = null
  }
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
  if (!props.vocab) {
    results.value = []
    return
  }
  isLoading.value = true
  errorMessage.value = ''
  try {
    const data = await searchOntologyTerms(props.vocab, query.value || '', props.searchOptions || {})
    results.value = data
    highlightedIndex.value = 0
    await nextTick()
    scrollHighlightedIntoView()
  } catch (err) {
    errorMessage.value = err?.message || 'Search failed.'
    results.value = []
  } finally {
    isLoading.value = false
  }
}

function selectResult(result, { refocus } = {}) {
  dropdownOpen.value = false
  query.value = result.label || result.prefLabel || result.id || ''
  emitSelection(result)
  const shouldRefocus = typeof refocus === 'boolean' ? refocus : props.autofocusAfterSelect
  if (!shouldRefocus) return
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function emitSelection(result) {
  if (!result) return
  const label = result.label || result.prefLabel || result.id || ''
  const identifier = result.id || result.identifier || ''
  const ontology = result.ontology || result.source || ''

  if (valueShape.value === 'reference') {
    const payload = {
      id: identifier || label,
      label,
      source: ontology || '',
      ontologyEnum: result.ontologyEnum || ''
    }
    emit('update:value', payload)
    saveOntologySelection(props.vocab, payload)
    return
  }

  const recordPayload = {
    identifier: identifier || '',
    label,
    ontology: ontology || '',
    definition: result.definition || '',
    synonyms: normalizeSuggestionList(result.synonyms || result.synonym),
    xrefs: normalizeSuggestionList(result.xrefs),
    ontologyEnum: result.ontologyEnum || ''
  }
  emit('update:value', recordPayload)
  const cachePayload = {
    ...recordPayload,
    id: recordPayload.identifier || label,
    source: recordPayload.ontology
  }
  saveOntologySelection(props.vocab, cachePayload)
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
  nextTick(scrollHighlightedIntoView)
}

function highlightPrev() {
  if (!results.value.length) return
  highlightedIndex.value =
    highlightedIndex.value - 1 < 0 ? results.value.length - 1 : highlightedIndex.value - 1
  nextTick(scrollHighlightedIntoView)
}

function selectHighlighted(event) {
  if (!dropdownOpen.value || !results.value.length) return
  selectResult(results.value[highlightedIndex.value])
}

function handleTab() {
  if (!dropdownOpen.value) return
  if (results.value.length) {
    selectResult(results.value[highlightedIndex.value], { refocus: false })
  }
  dropdownOpen.value = false
}

function scrollHighlightedIntoView() {
  if (!dropdownOpen.value) return
  const container = dropdownRef.value
  if (!container) return
  const list = container.querySelector('ul')
  if (!list) return
  const index = highlightedIndex.value
  if (index < 0 || index >= list.children.length) return
  const item = list.children[index]
  const baseOffset = list.offsetTop
  const itemTop = baseOffset + item.offsetTop
  const itemBottom = itemTop + item.offsetHeight
  const viewTop = container.scrollTop
  const viewBottom = viewTop + container.clientHeight
  if (itemTop < viewTop) {
    container.scrollTop = itemTop
  } else if (itemBottom > viewBottom) {
    container.scrollTop = itemBottom - container.clientHeight
  }
}

onBeforeUnmount(() => {
  if (searchHandle) {
    clearTimeout(searchHandle)
    searchHandle = null
  }
  cancelBlur()
})

function focusInput() {
  if (props.disabled) return
  inputRef.value?.focus()
}

function formatIdentifier(value) {
  if (!value) return ''
  const input = String(value)
  const lastSlashIndex = input.lastIndexOf('/')
  if (lastSlashIndex >= 0 && lastSlashIndex < input.length - 1) {
    return input.slice(lastSlashIndex + 1)
  }
  return input
}

function normalizeSuggestionList(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry !== '')
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  return []
}

defineExpose({
  focus: focusInput
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

.ontology-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  width: max(100%, 520px);
  max-width: calc(100% + 360px);
  background: #fff;
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  margin-top: 0.15rem;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
  z-index: 10;
  max-height: 220px;
  overflow-y: auto;
  font-size: 0.85rem;
  padding: 0.2rem 0;
  scrollbar-width: none;
}

.ontology-dropdown::-webkit-scrollbar {
  display: none;
}

.ontology-dropdown ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ontology-dropdown li {
  padding: 0.3rem 0.8rem;
  cursor: pointer;
  line-height: 1.15;
  display: block;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.ontology-dropdown li:first-child {
  border-top: none;
}

.ontology-dropdown li.is-active {
  background: rgba(191, 219, 254, 0.35);
}

.result-line {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  font-weight: 600;
  color: #0f172a;
}

.result-source {
  font-size: 0.75rem;
  color: #475569;
}

.result-definition {
  margin: 0;
  font-size: 0.75rem;
  color: #475569;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-hint,
.dropdown-error {
  padding: 0.5rem 0.6rem;
  margin: 0;
  font-size: 0.8rem;
  color: #475569;
}

.dropdown-error {
  color: #b91c1c;
}
</style>
