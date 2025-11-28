<script setup>
import { computed, reactive, watch } from 'vue'
import RecipeCardField from '../tiptap/nodes/RecipeCardField.vue'
import OntologyListField from '../tiptap/nodes/OntologyListField.vue'
import OntologyFieldInput from '../tiptap/nodes/OntologyFieldInput.vue'
import BiologyEntitiesField from '../components/fields/BiologyEntitiesField.vue'

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
  },
  contextOverrides: {
    type: Object,
    default: () => ({})
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
  setFieldValue(field, value)
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
  return resolveSchemaPath(field)
}

function getFieldConfig(field) {
  const layoutField = props.uiConfig?.layout?.fields?.[field]
  if (!layoutField) return {}
  return layoutField.ui || layoutField
}

function getFieldComponent(field) {
  return getFieldConfig(field).component || null
}

function getFieldValuePath(field) {
  return getFieldConfig(field).valuePath || null
}

function getFieldType(field) {
  const config = getFieldConfig(field)
  return config.fieldType || null
}

function isDataField(field) {
  const layoutField = props.uiConfig?.layout?.fields?.[field]
  if (layoutField?.jsonLd?.target === 'data') return true
  return false
}

function ensureFormData() {
  if (!localState.formData || typeof localState.formData !== 'object') {
    localState.formData = {}
  }
  return localState.formData
}

function getFieldValue(field) {
  const target = isDataField(field) ? ensureFormData() : localState
  return target[field]
}

function getComponentValue(field) {
  const base = getFieldValue(field)
  const valuePath = getFieldValuePath(field)
  if (valuePath) {
    return readValueAtPath(base, valuePath)
  }
  return base
}

function setFieldValue(field, value) {
  const target = isDataField(field) ? ensureFormData() : localState
  target[field] = value
  emit('update:modelValue', { ...localState })
}

function readValueAtPath(source, path) {
  if (!path) return source
  if (!source || typeof source !== 'object') return undefined
  const segments = path.split('.')
  let current = source
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined
    current = current[segment]
  }
  return current
}

function writeValueAtPath(target, path, value) {
  if (!path) return
  const segments = path.split('.')
  let current = target
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    if (!isPlainObject(current[segment])) {
      current[segment] = {}
    }
    current = current[segment]
  }
  current[segments.at(-1)] = value
}

function resolveSchemaPath(field) {
  if (!field || !props.schema) return {}
  const segments = field.split('.')
  let current = props.schema
  for (const segment of segments) {
    if (!current) return {}
    const next =
      current.properties?.[segment] ||
      current?.items?.properties?.[segment] ||
      current?.items
    if (!next) return {}
    current = next
  }
  return current
}

function updateBiologyEntities(field, entities) {
  const existing = getFieldValue(field)
  const base = isPlainObject(existing) ? { ...existing } : {}
  const valuePath = getFieldValuePath(field)
  if (valuePath) {
    writeValueAtPath(base, valuePath, entities)
  } else {
    base.entities = entities
  }
  setFieldValue(field, base)
}

function getInheritedEntities(field) {
  if (getFieldComponent(field) === 'BiologyEntitiesField') {
    return props.contextOverrides?.biology?.entities || []
  }
  return []
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
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
      <template v-else-if="getFieldComponent(field) === 'BiologyEntitiesField'">
        <BiologyEntitiesField
          :value="getComponentValue(field) || []"
          :inherited="getInheritedEntities(field)"
          :label="getFieldConfig(field).label || field"
          :help-text="getFieldConfig(field).helpText || ''"
          :read-only="props.readOnly"
          @update:value="(val) => updateBiologyEntities(field, val)"
        />
      </template>
      <template
        v-else-if="
          getFieldSchema(field).type === 'array' ||
          (typeof getFieldValue(field) === 'object' &&
            getFieldSchema(field).type !== 'boolean' &&
            getFieldSchema(field).type !== 'number')
        "
      >
        <textarea
          :id="`field-${field}`"
          class="metadata-textarea"
          :value="renderValue(getFieldSchema(field), getFieldValue(field))"
          :readonly="props.readOnly"
          :disabled="props.readOnly"
          @input="(event) => updateField(field, parseValue(getFieldSchema(field), event.target.value, getFieldValue(field)))"
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
          :value="renderValue(getFieldSchema(field), getFieldValue(field))"
          :readonly="props.readOnly"
          :disabled="props.readOnly"
          @input="(event) => updateField(field, parseValue(getFieldSchema(field), event.target.value, getFieldValue(field)))"
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
