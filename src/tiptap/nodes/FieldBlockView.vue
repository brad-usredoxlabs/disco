<template>
  <node-view-wrapper
    ref="wrapperRef"
    class="field-block"
    data-field-block="true"
    :class="{
      'field-block--error': hasErrors,
      'field-block--textarea': isTextarea,
      'field-block--body': node.attrs.section === 'body'
    }"
    @focusin="handleFocus"
  >
    <template v-if="isOntologyField">
      <div class="field-inline field-inline--ontology">
        <span class="field-label">{{ labelText }}</span>
        <OntologyFieldInput
          :value="node.attrs.value"
          :placeholder="placeholder"
          :vocab="node.attrs.vocab"
          @update:value="updateOntologyValue"
        />
      </div>
    </template>
    <template v-else-if="isOntologyListField">
      <div class="field-inline field-inline--ontology-list">
        <span class="field-label">{{ labelText }}</span>
        <OntologyListField
          class="ontology-list-field"
          :value="node.attrs.value"
          :vocab="node.attrs.vocab"
          :columns="node.attrs.columns || []"
          @update:value="(val) => updateFieldValue(val)"
        />
      </div>
    </template>
    <template v-else-if="isRecipeCardField">
      <div class="recipe-field-wrapper">
        <span class="field-label">{{ labelText }}</span>
        <RecipeCardField
          :value="node.attrs.value"
          :vocab="node.attrs.vocab"
          @update:value="updateRecipeValue"
        />
      </div>
    </template>
    <template v-else-if="isBiologyEntitiesField">
      <div class="biology-field-wrapper">
        <span class="field-label">{{ labelText }}</span>
        <BiologyEntitiesField
          :value="node.attrs.value || []"
          :read-only="isEditorReadOnly"
          @update:value="updateFieldValue"
        />
      </div>
    </template>
    <template v-else>
      <div
        class="field-inline"
        :class="{
          'field-inline--textarea': isTextarea,
          'field-inline--date': isDateLike
        }"
      >
        <span class="field-label">{{ labelText }}</span>
        <template v-if="isTextarea">
          <textarea
            class="field-input field-input--textarea"
            :placeholder="placeholder"
            v-model="localValue"
            @input="emitValue"
            rows="3"
          />
        </template>
        <template v-else-if="enumChoices.length">
          <div class="enum-wrapper">
            <input
              class="field-input"
              :placeholder="placeholder"
              v-model="localValue"
              @focus="openDropdown"
              @blur="closeDropdown"
              @input="handleEnumInput"
              @keydown="handleEnumKeydown"
              ref="enumInput"
              autocomplete="off"
            />
            <ul
              v-if="showDropdown"
              class="enum-dropdown"
              role="listbox"
            >
              <li
                v-for="(option, index) in filteredOptions"
                :key="option"
                :class="{ 'is-active': index === highlightedIndex }"
                @mousedown.prevent="selectOption(option)"
                role="option"
              >
                {{ option }}
              </li>
            </ul>
          </div>
        </template>
        <template v-else>
          <input
            class="field-input"
            :type="inputType"
            :placeholder="placeholder"
            v-model="localValue"
            @input="emitValue"
          />
        </template>
      </div>
    </template>
    <ul v-if="hasErrors" class="field-errors">
      <li v-for="(message, index) in node.attrs.errors" :key="index">
        {{ message }}
      </li>
    </ul>
  </node-view-wrapper>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'
import OntologyFieldInput from './OntologyFieldInput.vue'
import RecipeCardField from './RecipeCardField.vue'
import OntologyListField from './OntologyListField.vue'
import BiologyEntitiesField from '../../components/fields/BiologyEntitiesField.vue'

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  updateAttributes: {
    type: Function,
    required: true
  },
  editor: {
    type: Object,
    default: null
  }
})

const localValue = ref(props.node.attrs.value ?? '')
const wrapperRef = ref(null)

const hasErrors = computed(() => Array.isArray(props.node.attrs.errors) && props.node.attrs.errors.length > 0)
const placeholder = computed(() => props.node.attrs.placeholder || '')
const isTextarea = computed(() => ['textarea', 'longtext'].includes(props.node.attrs.dataType))
const enumChoices = computed(() => parseEnumOptions(props.node.attrs.enumOptions))
const isDateLike = computed(() => props.node.attrs.dataType === 'date' || props.node.attrs.fieldKey?.toLowerCase().includes('date'))
const inputType = computed(() => {
  if (props.node.attrs.dataType === 'date') return 'date'
  if (props.node.attrs.dataType === 'number') return 'number'
  return 'text'
})
const fieldType = computed(() => props.node.attrs.fieldType || '')
const isOntologyField = computed(() => fieldType.value === 'ontology')
const isRecipeCardField = computed(() => fieldType.value === 'recipeCard')
const isOntologyListField = computed(() => fieldType.value === 'ontologyList')
const isBiologyEntitiesField = computed(() => (props.node.attrs.component || '') === 'BiologyEntitiesField')
const isEditorReadOnly = computed(() => props.editor?.isEditable === false)

const labelText = computed(() => humanizeLabel(props.node.attrs.fieldKey))
const enumInput = ref(null)
const showDropdown = ref(false)
const query = ref('')
const highlightedIndex = ref(-1)
const filteredOptions = computed(() => {
  if (!query.value) return enumChoices.value
  return enumChoices.value.filter((option) => option.toLowerCase().includes(query.value.toLowerCase()))
})

watch(
  () => props.node.attrs.value,
  (val) => {
    if (isOntologyField.value || isRecipeCardField.value || isOntologyListField.value) return
    const nextValue = val ?? ''
    if (nextValue === localValue.value) return
    localValue.value = nextValue
    query.value = nextValue
  }
)

function emitValue() {
  props.updateAttributes({ value: localValue.value })
}

function handleEnumInput(event) {
  query.value = event.target.value
  localValue.value = event.target.value
  showDropdown.value = true
  highlightedIndex.value = 0
  emitValue()
}

function handleEnumKeydown(event) {
  if (!showDropdown.value && event.key !== 'Tab') {
    showDropdown.value = true
  }
  if (!filteredOptions.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    highlightedIndex.value = (highlightedIndex.value + 1) % filteredOptions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlightedIndex.value =
      highlightedIndex.value <= 0 ? filteredOptions.value.length - 1 : highlightedIndex.value - 1
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    if (highlightedIndex.value >= 0 && highlightedIndex.value < filteredOptions.value.length) {
      event.preventDefault()
      selectOption(filteredOptions.value[highlightedIndex.value])
    }
  } else if (event.key === 'Escape') {
    showDropdown.value = false
  }
}

function selectOption(option) {
  query.value = option
  localValue.value = option
  emitValue()
  showDropdown.value = false
  highlightedIndex.value = -1
  queueMicrotask(() => {
    enumInput.value?.focus()
    moveCaretToEnd(enumInput.value)
  })
}

function moveCaretToEnd(input) {
  if (!input) return
  const value = input.value || ''
  input.setSelectionRange(value.length, value.length)
}

function openDropdown() {
  showDropdown.value = true
  query.value = localValue.value || ''
  highlightedIndex.value = 0
}

function closeDropdown() {
  setTimeout(() => {
    showDropdown.value = false
  }, 150)
}

function parseEnumOptions(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function humanizeLabel(value = '') {
  if (!value) return 'Field'
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

function updateOntologyValue(value) {
  props.updateAttributes({ value })
}

function updateRecipeValue(value) {
  props.updateAttributes({ value })
}

function updateFieldValue(value) {
  props.updateAttributes({ value })
}

function handleFocus() {
  // Scroll management handled by useFieldNavigation to avoid conflicts.
}

</script>

<style scoped>
.field-block {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.35rem 0;
  border-radius: 6px;
  transition: background 0.2s, border 0.2s;
  border: 1px solid transparent;
  width: 100%;
}

.field-block + .field-block {
  margin-top: 0.75rem;
}

.field-block--body {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(148, 163, 184, 0.3);
}

.field-block--error {
  border-color: #f87171;
  background: #fef2f2;
}

.field-inline {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.field-inline--textarea {
  flex-direction: column;
  align-items: stretch;
  gap: 0.35rem;
}

.field-inline--ontology {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.field-inline--ontology-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.recipe-field-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-inline--date {
  justify-content: space-between;
}

.field-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: #374151;
  white-space: nowrap;
}

.field-label::after {
  content: ':';
  margin-left: 0.2rem;
}

.field-input {
  border: none;
  border-bottom: 1px dotted #cbd5f5;
  font-size: 0.95rem;
  padding: 0.2rem 0.25rem;
  flex: 1;
  min-width: 180px;
  max-width: 520px;
  background: transparent;
  color: #111827;
}

.field-inline--date .field-input {
  max-width: 200px;
  text-align: right;
  margin-left: auto;
}

.field-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.field-input--textarea {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0.5rem;
  background: #fff;
  resize: vertical;
}

.enum-wrapper {
  position: relative;
  flex: 1;
  min-width: 180px;
  max-width: 520px;
}

.field-errors {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  font-size: 0.75rem;
  color: #b91c1c;
}

.field-errors li + li {
  margin-top: 0.15rem;
}
</style>
