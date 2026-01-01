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
      This record is read-only. TapTab is in view-only mode.
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

    <section class="provenance-panel" v-if="provenanceEntries.length">
      <div class="prov-header">
        <p class="prov-title">Provenance (append-only)</p>
        <p class="prov-subtitle">Existing events are read-only. Add new entries below.</p>
      </div>
      <table class="prov-table">
        <thead>
          <tr>
            <th>Kind</th>
            <th>At</th>
            <th>By</th>
            <th>Activity</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(event, idx) in provenanceEntries" :key="idx">
            <td>{{ event.kind }}</td>
            <td>{{ event.at }}</td>
            <td>{{ event.by }}</td>
            <td>{{ event.activity || '—' }}</td>
            <td>{{ event.notes || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="provenance-panel">
      <div class="prov-header">
        <p class="prov-title">Add provenance event</p>
        <p class="prov-subtitle">Entries append only; no edits or deletes.</p>
      </div>
      <div class="prov-form">
        <label>
          Kind
          <select v-model="newProvenance.kind">
            <option value="create">create</option>
            <option value="update">update</option>
            <option value="ingest">ingest</option>
            <option value="transform">transform</option>
            <option value="analyze">analyze</option>
            <option value="import">import</option>
            <option value="export">export</option>
            <option value="derive">derive</option>
          </select>
        </label>
        <label>
          At
          <input type="text" v-model="newProvenance.at" />
        </label>
        <label>
          By
          <input type="text" v-model="newProvenance.by" />
        </label>
        <label>
          Activity
          <input type="text" v-model="newProvenance.activity" />
        </label>
        <label>
          Notes
          <input type="text" v-model="newProvenance.notes" />
        </label>
        <button class="primary" type="button" @click="appendProvenance" :disabled="!canAppendProvenance">
          Add provenance
        </button>
      </div>
    </section>

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
import { buildFieldDescriptors } from '../../records/markdownView'
import { serializeFrontMatter } from '../../records/frontMatter'
import { mergeMetadataAndFormData } from '../../records/jsonLdFrontmatter'
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
  const set = new Set(['id', 'recordType', 'shortSlug', '@id', '@context', '@type', 'createdAt', 'updatedAt', 'createdBy', 'recordId'])
  if (props.namingRule?.idField) set.add(props.namingRule.idField)
  if (props.namingRule?.shortSlugField) set.add(props.namingRule.shortSlugField)
  return set
})
const appendOnlyFields = new Set(['provenance'])

const activeRecordType = computed(() => metadata.value?.recordType || props.recordType || '')
const fieldDescriptorBundle = computed(() => buildFieldDescriptors(activeRecordType.value, props.schemaBundle || {}))
const metadataDescriptors = computed(() =>
  fieldDescriptorBundle.value.metadata.filter(
    (descriptor) => descriptor.name !== '@context' && descriptor.name !== '@id' && descriptor.name !== '@type'
  )
)
const combinedDescriptors = computed(() => [...metadataDescriptors.value, ...fieldDescriptorBundle.value.body])
const derivedIri = computed(() => metadata.value?.['@id'] || metadata.value?.recordId || '')
const derivedTypes = computed(() => {
  const value = metadata.value?.['@type']
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  return []
})
const descriptorMap = computed(() => {
  const map = new Map()
  combinedDescriptors.value.forEach((descriptor) => map.set(descriptor.name, { ...descriptor, section: 'record' }))
  return map
})
const metadataFieldSet = computed(() => new Set(combinedDescriptors.value.map((descriptor) => descriptor.name)))
const errorMessage = computed(() => error.value || '')
const isLoading = computed(() => loading.value || isHydrating.value)
const displayTitle = computed(() => metadata.value?.title || metadata.value?.id || 'Untitled record')
const generatedBodyHint = computed(() => '')

const formState = ref({})
const metadataDirty = ref(false)
const docDirty = ref(false)
const isDirty = computed(() => metadataDirty.value || docDirty.value)
const isSyncingFromDoc = ref(false)
const isSyncingFromMetadata = ref(false)
const metadataIssues = ref({})
const effectiveReadOnly = computed(() => props.readOnly)
const provenanceEntries = computed(() => (Array.isArray(metadata.value?.provenance) ? metadata.value.provenance : []))
const newProvenance = ref({
  kind: 'update',
  at: new Date().toISOString(),
  by: '',
  activity: '',
  notes: ''
})
const canAppendProvenance = computed(
  () => !!newProvenance.value.kind && !!newProvenance.value.at && !!newProvenance.value.by
)

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
        combinedDescriptors.value,
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
    if (!tiptapDoc.value) return
    runWithSyncFlag(isSyncingFromMetadata, () => {
      tiptapDoc.value = ensureFieldBlocks(
        tiptapDoc.value,
        metadata.value,
        formState.value,
        combinedDescriptors.value,
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
    protectedFields.value.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        delete updates[key]
      }
    })
    if (Object.keys(updates).length) {
      if (updates.provenance && metadata.value?.provenance) {
        updates.provenance = mergeProvenanceEntries(metadata.value.provenance, updates.provenance)
      }
      const next = mergeMetadata(metadata.value, updates)
      if (next.changed) {
        runWithSyncFlag(isSyncingFromDoc, () => {
          metadata.value = next.data
          metadataDirty.value = true
        })
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
        combinedDescriptors.value,
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
    const inferredType = frontMatter.recordType || frontMatter.kind || metadata.value?.recordType || props.recordType || ''
    
    // Filter out legacy/unrecognized fields
    const cleanedMeta = filterLegacyFields(frontMatter)
    
    metadata.value = { ...cleanedMeta, recordType: inferredType, kind: inferredType }
    originalMetadata.value = cloneJson(metadata.value || {})
    formState.value = {}
    const schemaRecord = mergeMetadataAndFormData(metadata.value || {}, {})
    const baseDoc = payload.tiptapDoc || buildDocFromRecord(schemaRecord, payload.body)

    tiptapDoc.value = ensureFieldBlocks(
      baseDoc,
      metadata.value,
      formState.value,
      combinedDescriptors.value,
      metadataIssues.value
    )
    originalDoc.value = cloneJson(tiptapDoc.value)
    metadataDirty.value = false
    docDirty.value = false
    runMetadataValidation()
  } catch (err) {
    statusMessage.value = err?.message || 'Failed to load record.'
    console.error('[TapTab] Failed to load document', err)
  } finally {
    isHydrating.value = false
  }
}

function filterLegacyFields(input) {
  if (!input || typeof input !== 'object') return input
  const legacy = new Set(['$schema', 'state', 'recordId', 'biology'])
  const cleaned = {}
  for (const [key, value] of Object.entries(input)) {
    if (legacy.has(key)) continue
    cleaned[key] = value
  }
  return cleaned
}

async function saveRecord() {
  if (effectiveReadOnly.value || !props.recordPath) {
    console.warn('[TapTab] Cannot save: read-only or no path')
    return
  }
  if (!tiptapDoc.value) {
    console.warn('[TapTab] Cannot save: no document')
    return
  }

  try {
    saving.value = true
    statusMessage.value = ''
    console.log('[TapTab] Building clean payload...')
    const { schemaRecord, cleanMeta, cleanForm } = buildCleanPayload()
    console.log('[TapTab] Schema record:', JSON.stringify(schemaRecord, null, 2))
    console.log('[TapTab] Schema record keys:', Object.keys(schemaRecord))
    
    console.log('[TapTab] Validating...')
    const validationResult = runMetadataValidation(schemaRecord)
    if (validationResult && !validationResult.ok) {
      console.error('[TapTab] Validation failed!')
      console.error('[TapTab] Issues:', JSON.stringify(validationResult.issues, null, 2))
      validationResult.issues.forEach((issue, idx) => {
        console.error(`[TapTab] Issue ${idx + 1}:`, issue)
      })
      statusMessage.value = 'Fix highlighted fields before saving.'
      saving.value = false
      return
    }
    console.log('[TapTab] Validation passed')
    
    const metadataPayload = schemaRecord
    console.log('[TapTab] Saving document...')
    await saveDocument({
      recordPath: props.recordPath,
      metadata: metadataPayload,
      tiptapDoc: tiptapDoc.value,
      sidecarName: 'body.tiptap.json',
      validationRecord: schemaRecord
    })
    console.log('[TapTab] Writing file...')
    await props.repo.writeFile(props.recordPath, serializeFrontMatter(metadataPayload))
    console.log('[TapTab] Save complete!')
    
    metadata.value = cleanMeta
    formState.value = cleanForm
    originalMetadata.value = cloneJson(cleanMeta)
    originalDoc.value = cloneJson(tiptapDoc.value)
    metadataDirty.value = false
    docDirty.value = false
    statusMessage.value = 'Record saved.'
    emit('saved', { metadata: metadata.value, recordPath: props.recordPath })
  } catch (err) {
    statusMessage.value = err?.message || 'Failed to save record.'
    console.error('[TapTab] Failed to save document', err)
    console.error('[TapTab] Error stack:', err?.stack)
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

function appendProvenance() {
  if (!canAppendProvenance.value) return
  const entry = {
    kind: newProvenance.value.kind || 'update',
    at: newProvenance.value.at || new Date().toISOString(),
    by: newProvenance.value.by || 'user',
    activity: newProvenance.value.activity || undefined,
    notes: newProvenance.value.notes || undefined
  }
  const merged = mergeProvenanceEntries(metadata.value?.provenance, entry)
  metadata.value = {
    ...metadata.value,
    provenance: merged
  }
  metadataDirty.value = true
  newProvenance.value = {
    kind: 'update',
    at: new Date().toISOString(),
    by: '',
    activity: '',
    notes: ''
  }
}

function buildCleanPayload() {
  const cleanMeta = scrubEmptyStrings(metadata.value || {})
  const cleanForm = scrubEmptyStrings(formState.value || {})
  const merged = mergeMetadataAndFormData(cleanMeta, cleanForm)
  // Scrub the merged result to ensure no undefined optional fields remain
  let schemaRecord = scrubEmptyStrings(merged) || {}
  
  // Ensure kind is set
  const recordType = activeRecordType.value || props.recordType
  if (recordType && !schemaRecord.kind) {
    schemaRecord.kind = recordType
  }
  schemaRecord.provenance = mergeProvenanceEntries(originalMetadata.value?.provenance, schemaRecord.provenance)
  
  // Filter out legacy fields AND recordType (not in schema, use kind instead)
  schemaRecord = filterLegacyFields(schemaRecord)
  delete schemaRecord.recordType
  
  // Final pass: remove any fields that are still undefined or empty strings
  schemaRecord = Object.fromEntries(
    Object.entries(schemaRecord).filter(([_, value]) => value !== undefined && value !== '')
  )
  
  return { cleanMeta, cleanForm, schemaRecord }
}

function runMetadataValidation(payloadOverride = null) {
  if (!props.validateRecord || !activeRecordType.value) {
    metadataIssues.value = {}
    return { ok: true }
  }
  const schemaPayload = payloadOverride || buildCleanPayload().schemaRecord
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

function scrubEmptyStrings(input) {
  if (input === '' || input === undefined || input === null) return undefined
  if (!input || typeof input !== 'object') return input
  if (Array.isArray(input)) {
    const cleaned = input
      .map((item) => scrubEmptyStrings(item))
      .filter((item) => item !== undefined && item !== null)
    return cleaned.length ? cleaned : undefined
  }
  const next = {}
  for (const [key, value] of Object.entries(input)) {
    const cleaned = scrubEmptyStrings(value)
    if (cleaned === undefined || cleaned === null) continue
    if (typeof cleaned === 'object' && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue
    next[key] = cleaned
  }
  return Object.keys(next).length ? next : undefined
}

function ensureFieldBlocks(doc, metadata, formData, descriptors, errorsMap = {}) {
  const baseDoc = doc ? cloneJson(doc) : { type: 'doc', content: [] }
  const mergedValues = { ...(metadata || {}), ...(formData || {}) }
  const nodes = descriptors.map((descriptor) =>
    createFieldBlockNode(descriptor, mergedValues?.[descriptor.name], errorsMap[descriptor.name] || [], 'record')
  )
  return {
    type: baseDoc.type || 'doc',
    content: nodes
  }
}

function createFieldBlockNode(descriptor, value, errors = [], section = 'metadata') {
  const schema = descriptor.schema || {}
  const placeholder = descriptor.config?.ui?.placeholder || schema.description || ''
  const enumOptions = schema.enum ? JSON.stringify(schema.enum) : null
  const isRequired = isFieldRequired(descriptor.name, schema, activeRecordType.value)
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
      itemSchema: descriptor.itemSchema || null,
      required: isRequired
    }
  }
}

function isFieldRequired(fieldName, fieldSchema, recordType) {
  // Check the record type schema for required fields
  const recordSchema = props.schemaBundle?.recordSchemas?.[recordType]
  if (!recordSchema || !Array.isArray(recordSchema.required)) {
    console.log(`[Required Check] No schema or required array for ${recordType}, field: ${fieldName}`)
    return false
  }
  const isReq = recordSchema.required.includes(fieldName)
  console.log(`[Required Check] ${recordType}.${fieldName}: ${isReq} (required fields: ${recordSchema.required.join(', ')})`)
  return isReq
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

function mergeProvenanceEntries(existing, incoming) {
  const list = []
  const seen = new Set()
  const addEntry = (entry) => {
    if (!entry) return
    const normalized = isPlainObject(entry) ? cloneJson(entry) : { notes: String(entry) }
    if (!normalized.kind) normalized.kind = 'derive'
    if (!normalized.at) normalized.at = new Date().toISOString()
    if (!normalized.by) normalized.by = 'user'
    const key = JSON.stringify(normalized)
    if (seen.has(key)) return
    seen.add(key)
    list.push(normalized)
  }
  ;(Array.isArray(existing) ? existing : existing ? [existing] : []).forEach(addEntry)
  ;(Array.isArray(incoming) ? incoming : incoming ? [incoming] : []).forEach(addEntry)
  return list.length ? list : undefined
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

.provenance-panel {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.prov-header {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-bottom: 0.5rem;
}

.prov-title {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}

.prov-subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}

.prov-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.prov-table th,
.prov-table td {
  border: 1px solid #e2e8f0;
  padding: 0.35rem 0.5rem;
  text-align: left;
}

.prov-table th {
  background: #eef2ff;
  color: #0f172a;
}

.prov-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.5rem;
  align-items: end;
}

.prov-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
  color: #0f172a;
}

.prov-form input,
.prov-form select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
}
</style>
