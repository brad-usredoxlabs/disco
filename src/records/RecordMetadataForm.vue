<script setup>
import { computed, reactive, watch } from 'vue'
import RecipeCardField from '../tiptap/nodes/RecipeCardField.vue'
import OntologyListField from '../tiptap/nodes/OntologyListField.vue'
import OntologyFieldInput from '../tiptap/nodes/OntologyFieldInput.vue'

const props = defineProps({
  schema: {
    type: Object,
    default: () => ({})
  },
  uiConfig: {
    type: Object,
    default: () => ({})
  },
  modelValue: {
    type: Object,
    default: () => ({})
  },
  readOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const localState = reactive({ ...props.modelValue })

watch(
  () => props.modelValue,
  (next) => {
    const snapshot = next || {}
    Object.keys(localState).forEach((key) => {
      if (!(key in snapshot)) {
        delete localState[key]
      }
    })
    Object.assign(localState, snapshot)
  },
  { deep: true }
)

function updateField(field, value) {
  localState[field] = value
  emit('update:modelValue', { ...localState })
}

const orderedFields = computed(() => {
  const layoutFields = props.uiConfig?.layout?.fields
  if (layoutFields) {
    return Object.entries(layoutFields)
      .map(([key, cfg]) => ({ key, order: cfg?.order ?? 0 }))
      .sort((a, b) => a.order - b.order)
      .map(({ key }) => key)
  }
  const schemaFields = Object.keys(props.schema?.properties || {})
  if (schemaFields.length) {
    return schemaFields
  }
  return Object.keys(props.modelValue || {})
})

function getFieldSchema(field) {
  return props.schema?.properties?.[field] || {}
}

function getFieldConfig(field) {
  const layoutField = props.uiConfig?.layout?.fields?.[field]
  if (!layoutField) return {}
  return layoutField.ui || layoutField
}

function getFieldType(field) {
  const config = getFieldConfig(field)
  return config.fieldType || null
}

function inputTypeFor(fieldSchema) {
  const type = fieldSchema?.type
  if (type === 'string' && fieldSchema?.format === 'date-time') return 'datetime-local'
  if (type === 'string' && fieldSchema?.format === 'date') return 'date'
  if (type === 'number' || type === 'integer') return 'number'
  if (type === 'boolean') return 'checkbox'
  return 'text'
}

function renderValue(fieldSchema, value) {
  if (fieldSchema?.type === 'array') {
    if (Array.isArray(value)) {
      return value.join('\n')
    }
    return ''
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2)
  }
  if (value === undefined || value === null) return ''
  return value
}

function parseValue(fieldSchema, rawValue, originalValue) {
  if (fieldSchema?.type === 'array') {
    const lines = rawValue
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return lines
  }
  if (fieldSchema?.type === 'number' || fieldSchema?.type === 'integer') {
    const parsed = Number(rawValue)
    return Number.isNaN(parsed) ? originalValue : parsed
  }
  if (fieldSchema?.type === 'boolean') {
    return !!rawValue
  }
  if (fieldSchema?.type === 'object') {
    try {
      return JSON.parse(rawValue)
    } catch (err) {
      return originalValue
    }
  }
  return rawValue
}
</script>

<template>
  <div class="record-metadata-form">
    <div v-for="field in orderedFields" :key="field" class="field-row">
      <label :for="`field-${field}`">{{ field }}</label>

      <template v-if="getFieldType(field) === 'recipeCard'">
        <RecipeCardField
          :value="localState[field]"
          :vocab="getFieldConfig(field).vocab || ''"
          :read-only="props.readOnly"
          @update:value="(val) => updateField(field, val)"
        />
      </template>
      <template v-else-if="getFieldType(field) === 'ontology'">
        <OntologyFieldInput
          :value="localState[field]"
          :vocab="getFieldConfig(field).vocab || ''"
          :disabled="props.readOnly"
          placeholder="Search term"
          @update:value="(val) => updateField(field, val)"
        />
      </template>
      <template v-else-if="getFieldType(field) === 'ontologyList'">
        <OntologyListField
          :value="localState[field]"
          :vocab="getFieldConfig(field).vocab || ''"
          :columns="getFieldConfig(field).columns || []"
          :read-only="props.readOnly"
          @update:value="(val) => updateField(field, val)"
        />
      </template>
      <template
        v-else-if="
          getFieldSchema(field).type === 'array' ||
          (typeof localState[field] === 'object' &&
            getFieldSchema(field).type !== 'boolean' &&
            getFieldSchema(field).type !== 'number')
        "
      >
        <textarea
          :id="`field-${field}`"
          class="metadata-textarea"
          :value="renderValue(getFieldSchema(field), localState[field])"
          :readonly="props.readOnly"
          :disabled="props.readOnly"
          @input="(event) => updateField(field, parseValue(getFieldSchema(field), event.target.value, localState[field]))"
        ></textarea>
      </template>
      <template v-else-if="getFieldSchema(field).type === 'boolean'">
        <input
          type="checkbox"
          :id="`field-${field}`"
          :checked="!!localState[field]"
          :disabled="props.readOnly"
          @change="(event) => updateField(field, event.target.checked)"
        />
      </template>
      <template v-else>
        <input
          :id="`field-${field}`"
          class="metadata-input"
          :type="inputTypeFor(getFieldSchema(field))"
          :value="renderValue(getFieldSchema(field), localState[field])"
          :readonly="props.readOnly"
          :disabled="props.readOnly"
          @input="(event) => updateField(field, parseValue(getFieldSchema(field), event.target.value, localState[field]))"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.record-metadata-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

label {
  font-weight: 600;
  color: #475569;
  text-transform: capitalize;
}

.metadata-input,
.metadata-textarea {
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  font-family: inherit;
}

.metadata-textarea {
  min-height: 90px;
  resize: vertical;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}
</style>
