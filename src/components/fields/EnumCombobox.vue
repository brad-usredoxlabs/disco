<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const query = ref(props.modelValue || '')
const open = ref(false)
const highlightedIndex = ref(0)
const inputRef = ref(null)
let blurHandle = null

watch(
  () => props.modelValue,
  (value) => {
    if (!open.value) {
      query.value = value || ''
    }
  }
)

const normalizedOptions = computed(() => Array.from(new Set(props.options || [])).filter(Boolean))
const filteredOptions = computed(() => {
  const list = normalizedOptions.value
  if (!query.value) return list
  const needle = query.value.toLowerCase()
  return list.filter((option) => option.toLowerCase().includes(needle))
})
const hasPendingInput = computed(() => (query.value || '') !== (props.modelValue || ''))

function openDropdown() {
  if (props.disabled) return
  cancelBlur()
  open.value = true
  highlightedIndex.value = Math.min(highlightedIndex.value, filteredOptions.value.length - 1)
}

function closeDropdown() {
  if (!open.value) return
  open.value = false
  highlightedIndex.value = 0
}

function handleFocus() {
  openDropdown()
}

function handleInput(event) {
  query.value = event.target.value
  openDropdown()
}

function handleBlur() {
  cancelBlur()
  blurHandle = setTimeout(() => {
    closeDropdown()
    blurHandle = null
  }, 120)
}

function cancelBlur() {
  if (blurHandle) {
    clearTimeout(blurHandle)
    blurHandle = null
  }
}

function highlightNext() {
  if (!filteredOptions.value.length) return
  highlightedIndex.value = (highlightedIndex.value + 1) % filteredOptions.value.length
}

function highlightPrev() {
  if (!filteredOptions.value.length) return
  highlightedIndex.value =
    highlightedIndex.value <= 0 ? filteredOptions.value.length - 1 : highlightedIndex.value - 1
}

function selectOption(option, { refocus = true } = {}) {
  query.value = option
  emit('update:modelValue', option)
  if (refocus) {
    nextTickFocus()
  }
}

function selectHighlighted({ refocus = true } = {}) {
  if (!filteredOptions.value.length) return
  const index = Math.max(0, Math.min(highlightedIndex.value, filteredOptions.value.length - 1))
  selectOption(filteredOptions.value[index], { refocus })
}

function handleKeydown(event) {
  if (props.disabled) return
  if (!open.value && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    openDropdown()
    event.preventDefault()
    return
  }
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      highlightNext()
      break
    case 'ArrowUp':
      event.preventDefault()
      highlightPrev()
      break
    case 'Enter':
      event.preventDefault()
      selectHighlighted()
      break
    case 'Tab':
      if ((open.value || hasPendingInput.value) && filteredOptions.value.length) {
        selectHighlighted({ refocus: false })
      }
      closeDropdown()
      return
    case 'Escape':
      closeDropdown()
      break
    default:
      break
  }
}

function nextTickFocus() {
  requestAnimationFrame(() => {
    inputRef.value?.focus()
  })
}

onBeforeUnmount(() => cancelBlur())
</script>

<template>
  <div class="enum-combobox" :class="{ 'is-disabled': disabled }">
    <input
      ref="inputRef"
      class="enum-input"
      type="text"
      :placeholder="placeholder"
      :value="query"
      :disabled="disabled"
      @focus="handleFocus"
      @blur="handleBlur"
      @input="handleInput"
      @keydown="handleKeydown"
    />
    <ul v-if="open && filteredOptions.length && !disabled" class="enum-dropdown" role="listbox">
      <li
        v-for="(option, index) in filteredOptions"
        :key="option"
        :class="{ 'is-active': index === highlightedIndex }"
        role="option"
        @mousedown.prevent="selectOption(option)"
      >
        {{ option }}
      </li>
    </ul>
    <p v-else-if="open && !filteredOptions.length" class="enum-empty">No matches</p>
  </div>
</template>

<style scoped>
.enum-combobox {
  position: relative;
}

.enum-input {
  width: 100%;
  border: 1px solid #cbd5f5;
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
  background: #fff;
}

.enum-combobox.is-disabled .enum-input {
  background: #f8fafc;
  color: #94a3b8;
}

.enum-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #cbd5f5;
  border-radius: 6px;
  max-height: 180px;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
  z-index: 5;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.1);
}

.enum-dropdown li {
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}

.enum-dropdown li.is-active {
  background: rgba(59, 130, 246, 0.12);
  color: #0f172a;
}

.enum-empty {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  border: 1px solid #cbd5f5;
  border-radius: 6px;
  margin: 0;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  color: #94a3b8;
  background: #fff;
}
</style>
