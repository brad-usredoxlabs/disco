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
  },
  contextOverrides: {
    type: Object,
    default: () => ({})
  },
  schemaContext: {
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

function getFieldSchemaInfo(field) {
  return resolveSchemaPath(field)
}

function getFieldSchema(field) {
  return getFieldSchemaInfo(field).node || {}
}

function getFieldItemSchema(field) {
  const info = getFieldSchemaInfo(field)
  if (!info.node) return {}
  if (info.node.type === 'array') {
    const itemInfo = dereferenceSchemaNode(info.node.items, info.root)
    return itemInfo.node || {}
  }
  return info.node
}

function getFieldConfig(field) {
  const layoutField = props.uiConfig?.layout?.fields?.[field]
  if (!layoutField) return {}
  return layoutField.ui || layoutField
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
  const value = target[field]
  const valuePath = getFieldValuePath(field)
  if (!valuePath) {
    return value
  }
  return readValueAtPath(value, valuePath)
}

function setFieldValue(field, value) {
  const target = isDataField(field) ? ensureFormData() : localState
  const valuePath = getFieldValuePath(field)
  if (valuePath) {
    const base = isPlainObject(target[field]) ? { ...target[field] } : {}
    if (value === undefined || value === null) {
      removeValueAtPath(base, valuePath)
    } else {
      writeValueAtPath(base, valuePath, value)
    }
    if (isPlainObject(base) && Object.keys(base).length === 0) {
      delete target[field]
    } else {
      target[field] = base
    }
  } else if (value === undefined || value === null) {
    delete target[field]
  } else {
    target[field] = value
  }
  if (isDataField(field) && target === localState.formData && Object.keys(localState.formData).length === 0) {
    delete localState.formData
  }
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

function removeValueAtPath(target, path) {
  if (!path || !isPlainObject(target)) return
  const segments = path.split('.')
  const stack = []
  let current = target
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    if (!isPlainObject(current[segment])) {
      return
    }
    stack.push({ parent: current, key: segment })
    current = current[segment]
  }
  delete current[segments.at(-1)]
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const { parent, key } = stack[i]
    const candidate = parent[key]
    if (isPlainObject(candidate) && Object.keys(candidate).length === 0) {
      delete parent[key]
    }
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function decodePointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function getFromPointer(target, pointer) {
  if (!target || typeof target !== 'object') return null
  if (!pointer || pointer === '#') return target
  const normalized = pointer.startsWith('#') ? pointer.slice(1) : pointer
  const segments = normalized.split('/').filter(Boolean).map(decodePointerSegment)
  let current = target
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment]
    } else {
      return null
    }
  }
  return current
}

function lookupExternalSchema(ref) {
  if (!ref?.startsWith('./')) return null
  const [filePart, fragment = ''] = ref.split('#')
  const key = filePart
    .replace(/^\.\//, '')
    .replace(/\.schema\.ya?ml$/i, '')
    .replace(/\.ya?ml$/i, '')
  const schema = props.schemaContext?.[key]
  if (!schema) return null
  const pointer = fragment ? `#${fragment}` : '#'
  const node = getFromPointer(schema, pointer)
  if (!node) return null
  return { node, root: schema }
}

function dereferenceSchemaNode(node, rootSchema) {
  if (!node || typeof node !== 'object' || !node.$ref) {
    return { node, root: rootSchema }
  }
  if (node.$ref.startsWith('#')) {
    const target = getFromPointer(rootSchema, node.$ref)
    if (!target) {
      return { node, root: rootSchema }
    }
    return dereferenceSchemaNode(target, rootSchema)
  }
  if (node.$ref.startsWith('./')) {
    const external = lookupExternalSchema(node.$ref)
    if (!external?.node) {
      return { node, root: rootSchema }
    }
    return dereferenceSchemaNode(external.node, external.root)
  }
  return { node, root: rootSchema }
}

function resolveSchemaPath(field) {
  if (!field || !props.schema) {
    return { node: {}, root: props.schema }
  }
  const segments = field.split('.')
  let cursor = { node: props.schema, root: props.schema }

  for (const segment of segments) {
    cursor = dereferenceSchemaNode(cursor.node, cursor.root)
    if (!cursor.node) {
      return { node: {}, root: cursor.root }
    }

    let nextNode = null
    let nextRoot = cursor.root

    if (cursor.node.properties?.[segment]) {
      nextNode = cursor.node.properties[segment]
    } else if (cursor.node.type === 'array') {
      const itemInfo = dereferenceSchemaNode(cursor.node.items, cursor.root)
      if (itemInfo.node?.properties?.[segment]) {
        nextNode = itemInfo.node.properties[segment]
        nextRoot = itemInfo.root
      } else {
        nextNode = cursor.node.items
        nextRoot = itemInfo.root
      }
    } else if (cursor.node.items?.properties?.[segment]) {
      nextNode = cursor.node.items.properties[segment]
    } else if (cursor.node.definitions?.[segment]) {
      nextNode = cursor.node.definitions[segment]
    } else if (cursor.node?.properties?.[segment]) {
      nextNode = cursor.node.properties[segment]
    } else {
      nextNode = cursor.node?.[segment]
    }

    if (!nextNode) {
      return { node: {}, root: cursor.root }
    }

    cursor = { node: nextNode, root: nextRoot }
  }

  return dereferenceSchemaNode(cursor.node, cursor.root)
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
          :value="getFieldValue(field)"
          :vocab="getFieldConfig(field).vocab || ''"
          :read-only="props.readOnly"
          @update:value="(val) => updateField(field, val)"
        />
      </template>
      <template v-else-if="getFieldType(field) === 'ontology'">
        <OntologyFieldInput
          :value="getFieldValue(field)"
          :vocab="getFieldConfig(field).vocab || ''"
          :disabled="props.readOnly"
          placeholder="Search term"
          @update:value="(val) => updateField(field, val)"
        />
      </template>
      <template v-else-if="getFieldType(field) === 'ontologyList'">
        <OntologyListField
          :value="getFieldValue(field)"
          :vocab="getFieldConfig(field).vocab || ''"
          :columns="getFieldConfig(field).columns || []"
          :read-only="props.readOnly"
          @update:value="(val) => updateField(field, val)"
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
