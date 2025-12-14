<template>
  <div class="tiptap-record-editor">
    <header class="editor-header">
      <div>
        <p class="editor-label">TapTab</p>
        <h3>{{ displayTitle }}</h3>
        <p class="editor-subtitle">
          {{ recordPath }}
          <span v-if="recordType">· {{ recordType }}</span>
        </p>
      </div>
      <div class="editor-actions">
        <button class="secondary" type="button" @click="emit('close')" :disabled="saving">Close</button>
        <button
          class="primary"
          type="button"
          :disabled="effectiveReadOnly || !isDirty || saving || !tiptapDoc"
          @click="saveRecord"
        >
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </header>

    <p v-if="effectiveReadOnly" class="read-only-banner">
      This record is immutable in the current workflow state. TapTab is in view-only mode.
    </p>
    <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    <div v-if="derivedIri || derivedTypes.length" class="jsonld-summary">
      <p v-if="derivedIri">
        <strong>IRI:</strong>
        <span class="jsonld-value">{{ derivedIri }}</span>
        <button class="copy-button" type="button" @click="copyToClipboard(derivedIri)">Copy</button>
      </p>
      <p v-if="derivedTypes.length">
        <strong>Types:</strong>
        <span class="jsonld-value">{{ derivedTypes.join(', ') }}</span>
      </p>
    </div>

    <div v-if="isLoading" class="loading-state">
      <p>Loading record…</p>
    </div>

    <div v-else class="editor-grid">
      <section class="tiptap-column tiptap-column--full">
        <p v-if="generatedBodyHint" class="generated-hint">
          {{ generatedBodyHint }}
        </p>
        <TipTapEditor v-if="tiptapDoc" v-model="tiptapDoc" :editable="!effectiveReadOnly" />
        <p v-else class="placeholder">No document content yet.</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import TipTapEditor from './TipTapEditor.vue'
import { useTipTapIO, buildDocFromRecord } from '../composables/useTipTapIO'
import { generateMarkdownView, buildFieldDescriptors } from '../../records/markdownView'
import { serializeFrontMatter } from '../../records/frontMatter'
import { composeRecordFrontMatter, extractRecordData, mergeMetadataAndFormData } from '../../records/jsonLdFrontmatter'
import {
  normalizeOntologyListEntry,
  normalizeOntologyListValue,
  normalizeOntologyValue,
  normalizeRecipeValue,
  ONTOLOGY_SHAPES,
  resolveOntologyShape
} from '../../records/fieldNormalization'

const props = defineProps({
  repo: {
    type: Object,
    required: true
  },
  recordPath: {
    type: String,
    default: ''
  },
  recordType: {
    type: String,
    default: ''
  },
  schema: {
    type: Object,
    default: () => ({})
  },
  uiConfig: {
    type: Object,
    default: () => ({})
  },
  namingRule: {
    type: Object,
    default: () => ({})
  },
  readOnly: {
    type: Boolean,
    default: false
  },
  validateRecord: {
    type: Function,
    default: null
  },
  workflowDefinition: {
    type: Object,
    default: null
  },
  schemaBundle: {
    type: Object,
    default: () => ({})
  },
  projectContextOverrides: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['close', 'saved'])

const propsValidator = computed(() => (record) => {
  if (props.validateRecord && activeRecordType.value) {
    const result = props.validateRecord(activeRecordType.value, record)
    if (!result.ok) {
      const summary =
        result.issues
          ?.map((issue) => (typeof issue === 'string' ? issue : `${issue.path || 'root'}: ${issue.message}`))
          .join('\n') || 'Validation failed'
      const err = new Error(summary)
      err.issues = result.issues
      throw err
    }
  }
})

const { loadDocument, saveDocument, loading, error } = useTipTapIO(props.repo, (record) => propsValidator.value?.(record))
const metadata = ref({})
const tiptapDoc = ref(null)
const originalMetadata = ref({})
const originalDoc = ref(null)
const statusMessage = ref('')
const saving = ref(false)
const isHydrating = ref(false)

const protectedFields = computed(() => {
  const set = new Set(['id', 'recordType', 'shortSlug'])
  if (props.namingRule?.idField) set.add(props.namingRule.idField)
  if (props.namingRule?.shortSlugField) set.add(props.namingRule.shortSlugField)
  return set
})

const activeRecordType = computed(() => metadata.value?.recordType || props.recordType || '')
const fieldDescriptorBundle = computed(() => buildFieldDescriptors(activeRecordType.value, props.schemaBundle || {}))
const metadataDescriptors = computed(() =>
  fieldDescriptorBundle.value.metadata.filter(
    (descriptor) => descriptor.name !== '@context' && descriptor.name !== '@id' && descriptor.name !== '@type'
  )
)
const derivedIri = computed(() => metadata.value?.['@id'] || metadata.value?.recordId || '')
const derivedTypes = computed(() => {
  const value = metadata.value?.['@type']
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  return []
})
const formFieldDescriptors = computed(() => fieldDescriptorBundle.value.body)
const descriptorMap = computed(() => {
  const map = new Map()
  metadataDescriptors.value.forEach((descriptor) =>
    map.set(descriptor.name, { ...descriptor, section: 'metadata' })
  )
  formFieldDescriptors.value.forEach((descriptor) =>
    map.set(descriptor.name, { ...descriptor, section: 'body' })
  )
  return map
})
const metadataFieldSet = computed(() => new Set(metadataDescriptors.value.map((descriptor) => descriptor.name)))
const errorMessage = computed(() => error.value || '')
const isLoading = computed(() => loading.value || isHydrating.value)
const displayTitle = computed(() => metadata.value?.title || metadata.value?.id || 'Untitled record')
const generatedBodyHint = computed(() => {
  const supported = props.schemaBundle?.manifest?.tiptap?.recordTypes || []
  if (!activeRecordType.value) return ''
  if (!supported.includes(activeRecordType.value)) return ''
  return 'Markdown body is generated from these fields and will be regenerated on save.'
})

const formState = ref({})
const metadataDirty = ref(false)
const formDirty = ref(false)
const docDirty = ref(false)
const isDirty = computed(() => metadataDirty.value || formDirty.value || docDirty.value)
const isSyncingFromDoc = ref(false)
const isSyncingFromMetadata = ref(false)
const metadataIssues = ref({})
const workflowConfig = computed(() => props.workflowDefinition?.config || null)
const workflowStateMeta = computed(() => {
  if (!workflowConfig.value || !metadata.value?.state) return {}
  return workflowConfig.value.states?.[metadata.value.state]?.meta || {}
})
const workflowImmutable = computed(() => !!workflowStateMeta.value?.immutable)
const effectiveReadOnly = computed(() => props.readOnly || workflowImmutable.value)

function runWithSyncFlag(flagRef, updater) {
  flagRef.value = true
  try {
    updater()
  } finally {
    nextTick(() => {
      flagRef.value = false
    })
  }
}

watch(
  () => metadata.value,
  () => {
    if (isHydrating.value || isSyncingFromDoc.value) return
    metadataDirty.value = true
    runMetadataValidation()
    if (!tiptapDoc.value) return
    runWithSyncFlag(isSyncingFromMetadata, () => {
      tiptapDoc.value = ensureFieldBlocks(
        tiptapDoc.value,
        metadata.value,
        formState.value,
        metadataDescriptors.value,
        formFieldDescriptors.value,
        metadataIssues.value
      )
    })
  },
  { deep: true }
)

watch(
  () => formState.value,
  () => {
    if (isHydrating.value || isSyncingFromDoc.value) return
    formDirty.value = true
    if (!tiptapDoc.value) return
    runWithSyncFlag(isSyncingFromMetadata, () => {
      tiptapDoc.value = ensureFieldBlocks(
        tiptapDoc.value,
        metadata.value,
        formState.value,
        metadataDescriptors.value,
        formFieldDescriptors.value,
        metadataIssues.value
      )
    })
  },
  { deep: true }
)

watch(
  () => tiptapDoc.value,
  (doc) => {
    if (isHydrating.value) return
    if (isSyncingFromMetadata.value) return
    docDirty.value = true
    const updates = extractFieldBlockValues(
      doc,
      descriptorMap.value,
      metadataFieldSet.value,
      { metadata: metadata.value, formData: formState.value }
    )
    if (Object.keys(updates).length) {
      const metadataUpdates = {}
      const bodyUpdates = {}
      Object.entries(updates).forEach(([key, value]) => {
        if (metadataFieldSet.value.has(key)) {
          metadataUpdates[key] = value
        } else {
          bodyUpdates[key] = value
        }
      })
      const next = mergeMetadata(metadata.value, metadataUpdates)
      if (next.changed) {
        runWithSyncFlag(isSyncingFromDoc, () => {
          metadata.value = next.data
          metadataDirty.value = true
        })
      }
      if (Object.keys(bodyUpdates).length) {
        const nextForm = mergeFormData(formState.value, bodyUpdates)
        if (nextForm.changed) {
          runWithSyncFlag(isSyncingFromDoc, () => {
            formState.value = nextForm.data
            formDirty.value = true
          })
        }
      }
    }
  },
  { deep: true }
)

watch(
  () => metadataIssues.value,
  () => {
    if (!tiptapDoc.value) return
    runWithSyncFlag(isSyncingFromMetadata, () => {
      tiptapDoc.value = ensureFieldBlocks(
        tiptapDoc.value,
        metadata.value,
        formState.value,
        metadataDescriptors.value,
        formFieldDescriptors.value,
        metadataIssues.value
      )
    })
  },
  { deep: true }
)

watch(
  () => props.recordPath,
  (path) => {
    if (path) {
      loadRecord(path)
    }
  },
  { immediate: true }
)

async function loadRecord(path) {
  try {
    isHydrating.value = true
    statusMessage.value = ''
    const payload = await loadDocument(path, { sidecarName: 'body.tiptap.json' })
    const frontMatter = payload.metadata || {}
    const inferredType =
      frontMatter.metadata?.recordType ||
      frontMatter.recordType ||
      metadata.value?.recordType ||
      props.recordType ||
      ''
    const { metadata: normalizedMetadata, formData } = extractRecordData(
      inferredType,
      frontMatter,
      props.schemaBundle || {}
    )
    metadata.value = normalizedMetadata || {}
    originalMetadata.value = cloneJson(normalizedMetadata || {})
    formState.value = { ...(formData || {}) }
    const schemaRecord = mergeMetadataAndFormData(normalizedMetadata, formData)
    const baseDoc = payload.tiptapDoc || buildDocFromRecord(schemaRecord, payload.body)

    tiptapDoc.value = ensureFieldBlocks(
      baseDoc,
      metadata.value,
      formState.value,
      metadataDescriptors.value,
      formFieldDescriptors.value,
      metadataIssues.value
    )
    originalDoc.value = cloneJson(tiptapDoc.value)
    metadataDirty.value = false
    formDirty.value = false
    docDirty.value = false
    runMetadataValidation()
  } catch (err) {
    statusMessage.value = err?.message || 'Failed to load record.'
    console.error('[TapTab] Failed to load document', err)
  } finally {
    isHydrating.value = false
  }
}

async function saveRecord() {
  if (effectiveReadOnly.value || !props.recordPath) return
  if (!tiptapDoc.value) return

  try {
    saving.value = true
    statusMessage.value = ''
    const validationResult = runMetadataValidation()
    if (validationResult && !validationResult.ok) {
      statusMessage.value = 'Fix highlighted fields before saving.'
      saving.value = false
      return
    }
    const schemaRecord = mergeMetadataAndFormData(metadata.value || {}, formState.value || {})
    const metadataPayload = composeRecordFrontMatter(
      activeRecordType.value,
      metadata.value || {},
      formState.value || {},
      props.schemaBundle || {},
      props.projectContextOverrides || {}
    )
    await saveDocument({
      recordPath: props.recordPath,
      metadata: metadataPayload,
      tiptapDoc: tiptapDoc.value,
      sidecarName: 'body.tiptap.json',
      validationRecord: schemaRecord
    })
    const markdown = generateMarkdownView(
      activeRecordType.value,
      metadata.value,
      formState.value || {},
      props.schemaBundle || {}
    )
    await props.repo.writeFile(
      props.recordPath,
      serializeFrontMatter(metadataPayload, markdown)
    )
    originalMetadata.value = cloneJson(metadata.value)
    originalDoc.value = cloneJson(tiptapDoc.value)
    metadataDirty.value = false
    docDirty.value = false
    statusMessage.value = 'Record saved.'
    emit('saved', { metadata: metadata.value, recordPath: props.recordPath })
  } catch (err) {
    statusMessage.value = err?.message || 'Failed to save record.'
    console.error('[TapTab] Failed to save document', err)
  } finally {
    saving.value = false
  }
}

function updateField(field, value) {
  if (protectedFields.value.has(field)) return
  metadata.value = {
    ...metadata.value,
    [field]: value
  }
}

function cloneJson(doc) {
  return doc ? JSON.parse(JSON.stringify(doc)) : null
}

function runMetadataValidation() {
  if (!props.validateRecord || !activeRecordType.value) {
    metadataIssues.value = {}
    return { ok: true }
  }
  const schemaPayload = mergeMetadataAndFormData(metadata.value || {}, formState.value || {})
  const result = props.validateRecord(activeRecordType.value, schemaPayload)
  if (result.ok) {
    metadataIssues.value = {}
    return result
  }
  const map = {}
  ;(result.issues || []).forEach((issue) => {
    if (typeof issue === 'string') {
      const [pathPart, ...rest] = issue.split(':')
      const key = pathPart?.trim() || 'root'
      if (!map[key]) map[key] = []
      map[key].push(rest.join(':').trim() || issue)
    } else {
      const key = (issue.path || 'root').split('.')[0] || 'root'
      if (!map[key]) map[key] = []
      map[key].push(issue.message)
    }
  })
  metadataIssues.value = map
  return result
}

function ensureFieldBlocks(doc, metadata, formData, metadataDescriptors, bodyDescriptors, errorsMap = {}) {
  const baseDoc = doc ? cloneJson(doc) : { type: 'doc', content: [] }
  const metadataNodes = metadataDescriptors.map((descriptor) =>
    createFieldBlockNode(descriptor, metadata?.[descriptor.name], errorsMap[descriptor.name] || [], 'metadata')
  )
  const bodyNodes = bodyDescriptors.map((descriptor) =>
    createFieldBlockNode(descriptor, formData?.[descriptor.name], errorsMap[descriptor.name] || [], 'body')
  )
  return {
    type: baseDoc.type || 'doc',
    content: [
      createSectionHeading('***Metadata***'),
      ...metadataNodes,
      createSectionHeading('***Record Body***'),
      ...bodyNodes
    ]
  }
}

function createSectionHeading(text) {
  return {
    type: 'heading',
    attrs: { level: 3 },
    content: [{ type: 'text', text }]
  }
}

function createFieldBlockNode(descriptor, value, errors = [], section = 'metadata') {
  const schema = descriptor.schema || {}
  const placeholder = descriptor.config?.ui?.placeholder || schema.description || ''
  const enumOptions = schema.enum ? JSON.stringify(schema.enum) : null
  return {
    type: 'fieldBlock',
    attrs: {
      fieldKey: descriptor.name,
      dataType: schema.type || 'string',
      placeholder,
      section,
      enumOptions,
      value: formatFieldValue(value, schema, descriptor.fieldType, descriptor.component, descriptor.valuePath, descriptor.config),
      fieldType: descriptor.fieldType || null,
      vocab: descriptor.vocab || null,
      columns: descriptor.columns || [],
      component: descriptor.component || null,
      valuePath: descriptor.valuePath || null,
      errors,
      schema,
      itemSchema: descriptor.itemSchema || null
    }
  }
}

function extractFieldBlockValues(doc, descriptorMap, metadataFieldSet, currentValues = {}) {
  const updates = {}
  if (!doc || !Array.isArray(doc.content)) {
    return updates
  }
  doc.content.forEach((node) => {
    if (node.type !== 'fieldBlock') return
    const key = node.attrs?.fieldKey
    if (!key) return
    const descriptor = descriptorMap.get(key)
    const isMetadataField = metadataFieldSet?.has(key)
    const baseValue = isMetadataField ? currentValues.metadata?.[key] : currentValues.formData?.[key]
    updates[key] = coerceFieldValue(
      node.attrs?.value,
      descriptor?.schema,
      descriptor?.fieldType,
      { columns: descriptor?.columns || [] },
      {
        component: node.attrs?.component || descriptor?.component,
        valuePath: node.attrs?.valuePath || descriptor?.valuePath,
        baseValue
      }
    )
  })
  return updates
}

function mergeMetadata(metadata, updates) {
  let changed = false
  const next = { ...(metadata || {}) }
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) {
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        delete next[key]
        changed = true
      }
      continue
    }
    const previous = next[key]
    if (Array.isArray(value) || Array.isArray(previous)) {
      const prevString = JSON.stringify(previous ?? [])
      const nextString = JSON.stringify(value ?? [])
      if (prevString !== nextString) {
        next[key] = value
        changed = true
      }
    } else if ((previous ?? '') !== (value ?? '')) {
      next[key] = value
      changed = true
    }
  }
  return { changed, data: next }
}

function mergeFormData(formData, updates) {
  let changed = false
  const next = { ...(formData || {}) }
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) {
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        delete next[key]
        changed = true
      }
      continue
    }
    const previous = next[key]
    if (Array.isArray(value) || Array.isArray(previous)) {
      const prevString = JSON.stringify(previous ?? [])
      const nextString = JSON.stringify(value ?? [])
      if (prevString !== nextString) {
        next[key] = value
        changed = true
      }
    } else if ((previous ?? '') !== (value ?? '')) {
      next[key] = value
      changed = true
    }
  }
  return { changed, data: next }
}

function copyToClipboard(value) {
  if (!value || typeof navigator === 'undefined') return
  try {
    navigator.clipboard?.writeText?.(value)
  } catch {
    /* ignore */
  }
}


function formatFieldValue(value, schema = {}, fieldType, _component, valuePath, config = {}) {
  const resolvedValue = valuePath && value && typeof value === 'object' ? readPath(value, valuePath) : value
  if (fieldType === 'ontology') {
    const shape = resolveOntologyShape(schema, ONTOLOGY_SHAPES.TERM)
    if (Array.isArray(resolvedValue)) {
      return resolvedValue.map((entry) => normalizeOntologyValue(entry, { schema, shape })).filter(Boolean)
    }
    return normalizeOntologyValue(resolvedValue, { schema, shape })
  }
  if (fieldType === 'ontologyList') {
    const listConfig = {
      ...config,
      schema,
      shape: resolveOntologyShape(schema, ONTOLOGY_SHAPES.REFERENCE),
      fallbackShape: ONTOLOGY_SHAPES.REFERENCE
    }
    if (Array.isArray(resolvedValue)) {
      return resolvedValue.map((entry) => normalizeOntologyListEntry(entry, listConfig)).filter(Boolean)
    }
    const normalized = normalizeOntologyListEntry(resolvedValue, listConfig)
    return normalized ? [normalized] : []
  }
  if (fieldType === 'recipeCard') {
    return normalizeRecipeValue(resolvedValue, schema)
  }
  if (schema.type === 'array') {
    if (Array.isArray(resolvedValue)) {
      return resolvedValue.join('\n')
    }
    return resolvedValue || ''
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return resolvedValue ?? ''
  }
  if (schema.type === 'boolean') {
    return resolvedValue === true ? 'true' : resolvedValue === false ? 'false' : ''
  }
  if (resolvedValue === undefined || resolvedValue === null) return ''
  return String(resolvedValue)
}

function coerceFieldValue(rawValue, schema = {}, fieldType, config = {}, options = {}) {
  const { valuePath, baseValue } = options || {}
  let normalizedValue
  if (fieldType === 'ontology') {
    const shape = resolveOntologyShape(schema, ONTOLOGY_SHAPES.TERM)
    if (Array.isArray(rawValue)) {
      normalizedValue = rawValue.map((entry) => normalizeOntologyValue(entry, { schema, shape })).filter(Boolean)
    } else {
      normalizedValue = normalizeOntologyValue(rawValue, { schema, shape }) || undefined
    }
  } else if (fieldType === 'ontologyList') {
    if (Array.isArray(rawValue)) {
      const listConfig = {
        ...config,
        schema,
        shape: resolveOntologyShape(schema, ONTOLOGY_SHAPES.REFERENCE),
        fallbackShape: ONTOLOGY_SHAPES.REFERENCE
      }
      normalizedValue = normalizeOntologyListValue(rawValue, listConfig)
    } else {
      normalizedValue = []
    }
  } else if (fieldType === 'recipeCard') {
    normalizedValue = normalizeRecipeValue(rawValue, schema)
  } else if (schema.type === 'array') {
    if (Array.isArray(rawValue)) {
      normalizedValue = rawValue
    } else if (typeof rawValue === 'string') {
      normalizedValue = rawValue
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    } else {
      normalizedValue = []
    }
  } else if (schema.type === 'number' || schema.type === 'integer') {
    const parsed = Number(rawValue)
    if (Number.isNaN(parsed)) {
      normalizedValue = undefined
    } else {
      normalizedValue = schema.type === 'integer' ? Math.trunc(parsed) : parsed
    }
  } else if (schema.type === 'boolean') {
    if (typeof rawValue === 'boolean') {
      normalizedValue = rawValue
    } else if (typeof rawValue === 'string') {
      normalizedValue = rawValue.toLowerCase() === 'true'
    } else {
      normalizedValue = undefined
    }
  } else if (rawValue === undefined || rawValue === null) {
    normalizedValue = undefined
  } else {
    normalizedValue = rawValue
  }

  if (valuePath) {
    const base = isPlainObject(baseValue) ? { ...baseValue } : {}
    if (normalizedValue === undefined) {
      clearPath(base, valuePath)
    } else {
      writePath(base, valuePath, normalizedValue)
    }
    return base
  }

  return normalizedValue
}

function readPath(target, path) {
  if (!target || typeof target !== 'object' || !path) return undefined
  const segments = path.split('.')
  let current = target
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined
    current = current[segment]
  }
  return current
}

function writePath(target, path, value) {
  if (!target || typeof target !== 'object' || !path) return
  const segments = path.split('.')
  if (segments.length === 1) {
    target[segments[0]] = value
    return
  }
  let current = target
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]
    if (!current[segment] || typeof current[segment] !== 'object') {
      current[segment] = {}
    }
    current = current[segment]
  }
  current[segments.at(-1)] = value
}

function clearPath(target, path) {
  if (!target || typeof target !== 'object' || !path) return
  const segments = path.split('.')
  const stack = []
  let current = target
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]
    if (!current[segment] || typeof current[segment] !== 'object') {
      return
    }
    stack.push({ parent: current, key: segment })
    current = current[segment]
  }
  delete current[segments.at(-1)]
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const { parent, key } = stack[i]
    if (parent[key] && typeof parent[key] === 'object' && !Array.isArray(parent[key]) && !Object.keys(parent[key]).length) {
      delete parent[key]
    }
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

</script>

<style scoped>
.tiptap-record-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 80vh;
  min-width: 0;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.editor-label {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
  color: #94a3b8;
}

.editor-header h3 {
  margin: 0.2rem 0 0;
  font-size: 1.6rem;
  color: #0f172a;
}

.editor-subtitle {
  margin: 0.1rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.editor-actions {
  display: flex;
  gap: 0.5rem;
}

.primary,
.secondary {
  border-radius: 999px;
  padding: 0.45rem 1rem;
  font-size: 0.9rem;
  border: 1px solid transparent;
  cursor: pointer;
}

.primary {
  background: #2563eb;
  color: #fff;
  border-color: #1d4ed8;
}

.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary {
  background: #fff;
  border-color: #e2e8f0;
}

.status-message {
  margin: 0;
  font-size: 0.85rem;
  color: #0f766e;
}

.error-message {
  margin: 0;
  font-size: 0.85rem;
  color: #b91c1c;
}

.read-only-banner {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  background: #fef9c3;
  color: #854d0e;
  border: 1px solid rgba(202, 138, 4, 0.4);
}

.loading-state {
  padding: 2rem;
  text-align: center;
  color: #94a3b8;
  font-style: italic;
}

.editor-grid {
  min-height: 0;
}

.tiptap-column {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tiptap-column--full {
  min-height: 60vh;
  padding-bottom: 6rem;
}

.generated-hint {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: #475569;
}

.placeholder {
  margin: 0;
  padding: 1rem;
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  color: #94a3b8;
  text-align: center;
}

.jsonld-summary {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  font-size: 0.9rem;
}

.jsonld-summary p {
  margin: 0.2rem 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.jsonld-value {
  font-family: 'JetBrains Mono', 'SFMono-Regular', monospace;
  color: #334155;
}

.copy-button {
  border: 1px solid #cbd5f5;
  background: #fff;
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
  font-size: 0.8rem;
  cursor: pointer;
}
</style>
