<template>
  <label
    class="field-input-row"
    :class="{
      'is-disabled': isDisabled,
      'field-input-row--compact': isCompact
    }"
  >
    <span class="field-input-label">{{ label }}</span>

    <template v-if="inputKind === 'textarea'">
      <textarea
        class="field-input-control field-input-textarea"
        :placeholder="placeholder"
        :rows="rows"
        :disabled="isDisabled"
        :value="textValue"
        @input="onTextInput($event.target.value)"
      ></textarea>
    </template>

    <template v-else-if="inputKind === 'checkbox'">
      <input
        class="field-input-control field-input-checkbox"
        type="checkbox"
        :checked="!!modelValue"
        :disabled="isDisabled"
        @change="emitBoolean($event.target.checked)"
      />
    </template>

    <template v-else-if="options.length">
      <input
        class="field-input-control"
        type="text"
        :list="datalistId"
        :placeholder="placeholder"
        :disabled="isDisabled"
        :value="stringValue"
        @input="emitString($event.target.value)"
      />
      <datalist :id="datalistId">
        <option v-for="option in options" :key="option" :value="option" />
      </datalist>
    </template>

    <template v-else>
      <input
        class="field-input-control"
        :type="inputKind"
        :placeholder="placeholder"
        :disabled="isDisabled"
        :value="stringValue"
        @input="onTextInput($event.target.value)"
      />
    </template>
  </label>
  <ul v-if="errors.length" class="field-error-list">
    <li v-for="(error, index) in errors" :key="index">{{ error }}</li>
  </ul>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  schema: {
    type: Object,
    default: () => ({})
  },
  config: {
    type: Object,
    default: () => ({})
  },
  modelValue: {
    type: [String, Number, Boolean, Array, Object, null],
    default: null
  },
  disabled: {
    type: Boolean,
    default: false
  },
  errors: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const label = computed(() => props.config?.label || humanize(props.name))
const placeholder = computed(() => props.config?.ui?.placeholder || props.schema?.description || '')
const rows = computed(() => props.config?.ui?.rows || 3)
const options = computed(() => props.schema?.enum || [])
const datalistId = computed(() => `field-options-${props.name}`)
const isDisabled = computed(() => !!props.disabled || props.config?.ui?.readOnly)
const isCompact = computed(() => {
  if (props.schema?.format === 'date') return true
  const component = (props.config?.ui?.component || '').toLowerCase()
  if (component.includes('signature') || component.includes('initial')) return true
  if (props.config?.ui?.align === 'right') return true
  return false
})

const inputKind = computed(() => {
  if (props.config?.ui?.component === 'markdown-textarea' || props.config?.ui?.component === 'textarea') {
    return 'textarea'
  }
  if (props.schema?.type === 'boolean') return 'checkbox'
  if (props.schema?.type === 'array') return 'textarea'
  if (props.schema?.type === 'number' || props.schema?.type === 'integer') return 'number'
  if (props.schema?.format === 'date') return 'date'
  if (props.schema?.format === 'date-time') return 'datetime-local'
  return 'text'
})

const stringValue = computed(() => {
  if (Array.isArray(props.modelValue)) {
    return props.modelValue.join(', ')
  }
  if (props.modelValue === undefined || props.modelValue === null) {
    return ''
  }
  return String(props.modelValue)
})

const textValue = computed(() => {
  if (Array.isArray(props.modelValue)) {
    return props.modelValue.join('\n')
  }
  if (props.modelValue === undefined || props.modelValue === null) {
    return ''
  }
  return String(props.modelValue)
})

function onTextInput(value) {
  if (inputKind.value === 'number') {
    const parsed = value === '' ? null : Number(value)
    emit('update:modelValue', Number.isNaN(parsed) ? null : parsed)
    return
  }
  if (props.schema?.type === 'array') {
    const items = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
    emit('update:modelValue', items)
    return
  }
  emit('update:modelValue', value)
}

function emitBoolean(value) {
  emit('update:modelValue', !!value)
}

function emitString(value) {
  emit('update:modelValue', value)
}

function humanize(text = '') {
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
}
</script>

<style scoped>
.field-input-row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.field-input-row--compact {
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.field-input-row.is-disabled {
  opacity: 0.6;
}

.field-error-list {
  margin: 0.25rem 0 0.75rem;
  padding-left: 1.25rem;
  color: #b91c1c;
  font-size: 0.8rem;
}

.field-input-label {
  font-weight: 600;
  color: #0f172a;
  text-transform: capitalize;
}

.field-input-row--compact .field-input-label {
  min-width: auto;
  text-align: right;
}

.field-input-control {
  width: 100%;
  border: none;
  border-bottom: 1px dashed #cbd5f5;
  padding: 0.35rem 0.1rem;
  font-size: 0.95rem;
  background: transparent;
  color: #0f172a;
}

.field-input-row--compact .field-input-control {
  width: auto;
  min-width: 160px;
  max-width: 240px;
  text-align: right;
}

.field-input-control:focus {
  outline: none;
  border-bottom-color: #2563eb;
}

.field-input-textarea {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.5rem 0.7rem;
  background: #fff;
  min-height: 80px;
  resize: vertical;
}

.field-input-checkbox {
  width: auto;
}
</style>
