<script setup>
import { computed, ref, toRef, watch, nextTick } from 'vue'
import RecordMetadataForm from '../records/RecordMetadataForm.vue'
import AssistantPanel from './AssistantPanel.vue'
import { parseFrontMatter, serializeFrontMatter } from '../records/frontMatter'
import { useRecordValidator } from '../records/recordValidator'
import { mergeMetadataAndFormData } from '../records/jsonLdFrontmatter'
import { buildRecordContextOverrides } from '../records/biologyInheritance'

const props = defineProps({
  repo: {
    type: Object,
    required: true
  },
  node: {
    type: Object,
    default: null
  },
  schemaLoader: {
    type: Object,
    required: true
  },
  recordGraph: {
    type: [Object, Function],
    default: () => ({ nodesByPath: {}, nodesById: {} })
  },
  onOpenPath: {
    type: Function,
    default: null
  }
})

const currentNode = toRef(props, 'node')
const plainTextContent = ref('')
const recordMetadata = ref({})
const recordType = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const status = ref('')
const error = ref('')
const metadataDirty = ref(false)
const plainTextDirty = ref(false)
const validationState = ref({ status: 'idle', issues: [], ok: false })
const hydrationDepth = ref(0)
const isHydrating = computed(() => hydrationDepth.value > 0)
function beginHydration() {
  hydrationDepth.value += 1
}
async function endHydration() {
  await nextTick()
  hydrationDepth.value = Math.max(0, hydrationDepth.value - 1)
}

const isFile = computed(() => currentNode.value?.kind === 'file')
const filePath = computed(() => (currentNode.value ? currentNode.value.path : ''))
const isRecord = computed(() => !!recordType.value)
const isDirty = computed(() => metadataDirty.value || plainTextDirty.value)
const schemaBundle = computed(() => props.schemaLoader.schemaBundle?.value)
const activeSchema = computed(() => (isRecord.value ? schemaBundle.value?.recordSchemas?.[recordType.value] : null))
const activeUiConfig = computed(() => (isRecord.value ? schemaBundle.value?.uiConfigs?.[recordType.value] : null))
const namingRule = computed(() => (isRecord.value ? schemaBundle.value?.naming?.[recordType.value] : null))
const tipTapRecordTypes = computed(() => schemaBundle.value?.manifest?.tiptap?.recordTypes || [])
const supportsTipTap = computed(() => {
  if (!isRecord.value) return false
  if (!tipTapRecordTypes.value.length) return false
  return tipTapRecordTypes.value.includes(recordType.value)
})
const validator = useRecordValidator(props.schemaLoader)
const metadataModel = computed({
  get: () => recordMetadata.value,
  set: (val) => {
    recordMetadata.value = val || {}
  }
})

const graphData = computed(() => {
  if (props.recordGraph?.graph?.value) return props.recordGraph.graph.value
  if (props.recordGraph?.value) return props.recordGraph.value
  return props.recordGraph || {}
})
const graphNode = computed(() => {
  const path = filePath.value
  if (!path) return null
  return graphData.value?.nodesByPath?.[path] || null
})
const recordContextOverrides = computed(() => buildRecordContextOverrides(graphNode.value))
const derivedIri = computed(() => recordMetadata.value?.['@id'] || recordMetadata.value?.recordId || '')
const derivedTypes = computed(() => {
  const value = recordMetadata.value?.['@type']
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  return []
})
const parentRecords = computed(() => buildRelationList(graphNode.value?.parents))
const childRecords = computed(() => buildRelationList(graphNode.value?.children))
const backlinkRecords = computed(() => graphNode.value?.backlinks || { parents: [], children: [], related: [] })
const assistantDefinition = computed(() => {
  if (!isRecord.value) return null
  const assistant = schemaBundle.value?.assistant
  return assistant?.[recordType.value] || null
})
const metadataFieldList = computed(() => {
  if (!isRecord.value) return []
  return schemaBundle.value?.metadataFields?.[recordType.value] || []
})
const canOpenTipTap = computed(() => {
  if (!isRecord.value || !isFile.value) return false
  if (!supportsTipTap.value) return false
  if (!activeSchema.value) return false
  if (isLoading.value) return false
  return !isDirty.value
})
const tipTapDisabledReason = computed(() => {
  if (!isRecord.value || !isFile.value) return 'Open a metadata-backed record first.'
  if (!supportsTipTap.value) return 'TapTab is not enabled for this record type.'
  if (!activeSchema.value) return 'This record type is missing a schema definition.'
  if (isLoading.value) return 'Wait for the file to finish loading.'
  if (isDirty.value) return 'Save or discard your pending changes before opening TapTab.'
  return ''
})

function evaluateGuard(name) {
  if (!name) return true
  if (name === 'validation.passed') {
    return validationState.value.ok
  }
  if (name === 'signoff.atLeastOne') {
    const signoff = recordMetadata.value?.signoff
    return !!signoff && Object.values(signoff).some((value) => !!value)
  }
  return true
}

function resolveRecordById(id) {
  if (!id) return null
  return graphData.value?.nodesById?.[id] || null
}

function buildRelationList(list) {
  if (!Array.isArray(list)) return []
  return list.map((edge) => ({
    ...edge,
    targetNode: resolveRecordById(edge.targetId)
  }))
}

function openRecordById(id) {
  const node = resolveRecordById(id)
  if (node && typeof props.onOpenPath === 'function') {
    props.onOpenPath(node.path)
  }
}

const validationStatus = computed(() => {
  if (!isRecord.value) return 'idle'
  return validationState.value.status
})

const validationMessage = computed(() => {
  if (!isRecord.value) return 'File validation available for record types only.'
  if (validationState.value.status === 'ok') return 'Metadata matches schema requirements.'
  if (validationState.value.status === 'pending') return 'Validating metadata…'
  if (validationState.value.issues.length) return validationState.value.issues[0]
  return 'No validation results yet.'
})

watch(
  () => currentNode.value,
  async (node) => {
    status.value = ''
    error.value = ''
    plainTextContent.value = ''
    recordMetadata.value = {}
    recordType.value = ''
    metadataDirty.value = false
    plainTextDirty.value = false
    validationState.value = { status: 'idle', issues: [], ok: false }

    if (node?.kind === 'file') {
      await loadFile(node)
    }
  },
  { immediate: true }
)

async function loadFile(node) {
  if (!node) return
  try {
    isLoading.value = true
    beginHydration()
    const content = await props.repo.readFile(node.path)
    const { data } = parseFrontMatter(content)
    const frontMatter = data || {}
  const inferredType = inferRecordType(frontMatter, node.path)
  const merged = { ...frontMatter }
  if (!merged.recordType && inferredType) merged.recordType = inferredType
  recordMetadata.value = merged
  recordType.value = merged?.recordType || inferredType || ''
  plainTextContent.value = content
  runRecordValidation()
  status.value = `Loaded ${node.name}`
} catch (err) {
  error.value = err?.message || 'Unable to load file.'
} finally {
    await endHydration()
    isLoading.value = false
  }
}

async function saveFile() {
  if (!isFile.value) return
  try {
    isSaving.value = true
    const payload = isRecord.value ? serializeFrontMatter(recordMetadata.value) : plainTextContent.value
    await props.repo.writeFile(filePath.value, payload)
    props.recordGraph?.rebuild?.()
    props.searchIndex?.rebuild?.()
    status.value = 'Saved changes'
    metadataDirty.value = false
    plainTextDirty.value = false
  } catch (err) {
    error.value = err?.message || 'Failed to save file.'
  } finally {
    isSaving.value = false
  }
}

function refreshMarkdownPreview() {
  // No-op: markdown body removed in favor of flat YAML.
}

async function regenerateMarkdown() {
  if (!isRecord.value || !supportsTipTap.value || !filePath.value) return
  try {
    status.value = 'Refreshing record…'
    await props.repo.writeFile(filePath.value, serializeFrontMatter(recordMetadata.value))
    status.value = 'Record refreshed.'
  } catch (err) {
    status.value = ''
    error.value = err?.message || 'Unable to refresh record.'
  }
}

function onPlainTextInput(event) {
  plainTextContent.value = event.target.value
  metadataDirty.value = false
  plainTextDirty.value = true
}

function updateRecordBody(event) {
  // Markdown body removed; keep handler for legacy wiring.
}

function inferRecordType(frontMatter, path) {
  if (!frontMatter) return ''
  const explicit =
    frontMatter.metadata?.recordType ||
    frontMatter.recordType ||
    frontMatter.record_type ||
    frontMatter.type ||
    frontMatter.record_type_id
  if (explicit) return explicit

  const naming = schemaBundle.value?.naming || {}
  const normalizedPath = path || ''
  for (const [type, rule] of Object.entries(naming)) {
    if (rule?.baseDir && normalizedPath.includes(`/${rule.baseDir}/`)) {
      return type
    }
  }
  return ''
}

function runRecordValidation() {
  if (!isRecord.value) {
    validationState.value = { status: 'idle', issues: [], ok: false }
    return
  }
  validationState.value = { status: 'pending', issues: [], ok: false }
  const schemaPayload = mergeMetadataAndFormData(recordMetadata.value)
  const result = validator.validate(recordType.value, schemaPayload)
  const formattedIssues = (result.issues || []).map((issue) =>
    typeof issue === 'string' ? issue : `${issue.path || 'root'}: ${issue.message}`
  )
  validationState.value = {
    status: result.ok ? 'ok' : 'error',
    issues: formattedIssues,
    ok: result.ok
  }
}

watch(
  () => recordMetadata.value,
  () => {
    if (!isRecord.value) return
    if (isHydrating.value) return
    metadataDirty.value = true
    runRecordValidation()
  },
  { deep: true }
)

watch(
  () => schemaBundle.value,
  () => {
    if (isRecord.value) {
      runRecordValidation()
    }
  }
)

watch(
  () => recordType.value,
  () => {
    if (isRecord.value) {
      runRecordValidation()
    }
  }
)

function revalidate() {
  runRecordValidation()
}

function applyAssistantMetadata(payload) {
  if (!payload || typeof payload !== 'object') return
  const namingRule = schemaBundle.value?.naming?.[recordType.value]
  const protectedFields = new Set(['id', 'recordType', 'title', 'shortSlug'])
  if (namingRule?.idField) protectedFields.add(namingRule.idField)
  if (namingRule?.shortSlugField) protectedFields.add(namingRule.shortSlugField)

  const sanitized = { ...payload }
  let stripped = false
  protectedFields.forEach((field) => {
    if (field in sanitized && sanitized[field] !== recordMetadata.value[field]) {
      delete sanitized[field]
      stripped = true
    }
  })

  if (!Object.keys(sanitized).length) {
    status.value = 'Assistant suggestion ignored (protected identifiers).'
    return
  }

  const next = {
    ...recordMetadata.value,
    ...sanitized
  }
  const validation = validator.validate(recordType.value, mergeMetadataAndFormData(next))
  if (!validation.ok) {
    status.value = `Assistant metadata rejected: ${validation.issues?.[0] || 'validation failed'}`
    return
  }
  recordMetadata.value = next
  metadataDirty.value = true
  refreshMarkdownPreview()
  status.value = stripped ? 'Applied assistant metadata (identifiers preserved).' : 'Applied assistant metadata.'
}

function applyAssistantFormData(formUpdates) {
  if (!formUpdates || typeof formUpdates !== 'object') return
  const currentFormData = { ...(recordMetadata.value.formData || {}) }
  let changed = false
  Object.entries(formUpdates).forEach(([key, value]) => {
    if (!valuesEqual(currentFormData[key], value)) {
      if (value === undefined) {
        delete currentFormData[key]
      } else {
        currentFormData[key] = value
      }
      changed = true
    }
  })

  if (!changed) {
    status.value = 'Assistant form data matched current record.'
    return
  }

  const next = {
    ...recordMetadata.value,
    formData: currentFormData
  }
  const validation = validator.validate(recordType.value, mergeMetadataAndFormData(next))
  if (!validation.ok) {
    status.value = `Assistant form data rejected: ${validation.issues?.[0] || 'validation failed'}`
    return
  }
  recordMetadata.value = next
  metadataDirty.value = true
  refreshMarkdownPreview()
  status.value = 'Applied assistant form data.'
}

function valuesEqual(a, b) {
  if (a === b) return true
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  } catch {
    return false
  }
}

function openTipTapEditor() {
  if (!canOpenTipTap.value) {
    if (tipTapDisabledReason.value) {
      status.value = tipTapDisabledReason.value
    }
    return
  }
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('tiptapPath')
  url.searchParams.delete('tiptapType')
  url.searchParams.delete('tiptapBundle')
  url.searchParams.set('tiptapPath', filePath.value || '')
  url.searchParams.set('tiptapType', recordType.value || '')
  const bundle = props.schemaLoader.selectedBundle?.value
  if (bundle) {
    url.searchParams.set('tiptapBundle', bundle)
  }
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
  status.value = 'Opened TapTab in a new tab.'
}
</script>

<template>
  <div class="workbench">
    <header class="workbench-header">
      <div>
        <p class="workbench-label">File Inspector</p>
        <h3 v-if="isFile">{{ filePath }}</h3>
        <p v-else>Select a file from the tree to load it here.</p>
      </div>
      <div class="workbench-actions">
        <button
          class="secondary"
          type="button"
          :disabled="!isFile || isLoading"
          @click="loadFile(currentNode)"
        >
          Reload
        </button>
        <button
          v-if="supportsTipTap"
          class="secondary"
          type="button"
          :disabled="!canOpenTipTap"
          :title="tipTapDisabledReason"
          @click="openTipTapEditor"
        >
          Edit in TapTab
        </button>
        <button
          class="primary"
          type="button"
          :disabled="!isFile || !isDirty || isSaving"
          @click="saveFile"
        >
          {{ isSaving ? 'Saving…' : 'Save changes' }}
        </button>
        <button
          v-if="isRecord && supportsTipTap"
          class="secondary"
          type="button"
          :disabled="isLoading || isSaving"
          @click="regenerateMarkdown"
        >
          Regenerate markdown
        </button>
      </div>
    </header>

    <div v-if="error" class="workbench-alert error">{{ error }}</div>
    <div v-else-if="status" class="workbench-alert ok">{{ status }}</div>

    <div
      v-if="isRecord"
      class="validation-banner"
      :class="{
        'is-ok': validationStatus === 'ok',
        'is-error': validationStatus === 'error',
        'is-pending': validationStatus === 'pending'
      }"
    >
      <div class="validation-copy">
        <strong>Validation</strong>
        <span>{{ validationMessage }}</span>
      </div>
      <button class="text-button" type="button" :disabled="validationStatus === 'pending'" @click="revalidate">
        {{ validationStatus === 'pending' ? 'Validating…' : 'Re-run validation' }}
      </button>
    </div>

    <section v-if="graphNode" class="relationships-panel">
      <header class="record-section-header">
        <p class="section-label">Relationships</p>
      </header>
      <div class="relationship-columns">
        <div>
          <h5>Parents</h5>
          <p v-if="!parentRecords.length" class="relationship-empty">No parents listed.</p>
          <ul v-else>
            <li v-for="parent in parentRecords" :key="`${parent.relName}-${parent.targetId}`">
              <div>
                <strong>{{ parent.targetNode?.title || parent.targetId }}</strong>
                <span class="relationship-meta">{{ parent.recordType }}</span>
              </div>
              <button class="text-button" type="button" @click="openRecordById(parent.targetId)">
                Open
              </button>
            </li>
          </ul>
        </div>
        <div>
          <h5>Children</h5>
          <p v-if="!childRecords.length" class="relationship-empty">No children listed.</p>
          <ul v-else>
            <li v-for="child in childRecords" :key="`${child.relName}-${child.targetId}`">
              <div>
                <strong>{{ child.targetNode?.title || child.targetId }}</strong>
                <span class="relationship-meta">{{ child.recordType }}</span>
              </div>
              <button class="text-button" type="button" @click="openRecordById(child.targetId)">
                Open
              </button>
            </li>
          </ul>
        </div>
        <div>
          <h5>Referenced by</h5>
          <p v-if="!(backlinkRecords.parents?.length || backlinkRecords.children?.length || backlinkRecords.related?.length)" class="relationship-empty">
            No backlinks yet.
          </p>
          <ul>
            <li
              v-for="parent in backlinkRecords.parents || []"
              :key="`b-parent-${parent.fromId}-${parent.field}`"
            >
              <div>
                <strong>{{ parent.fromId }}</strong>
                <span class="relationship-meta">parent reference</span>
              </div>
              <button class="text-button" type="button" @click="openRecordById(parent.fromId)">
                Open
              </button>
            </li>
            <li
              v-for="child in backlinkRecords.children || []"
              :key="`b-child-${child.fromId}-${child.field}`"
            >
              <div>
                <strong>{{ child.fromId }}</strong>
                <span class="relationship-meta">child reference</span>
              </div>
              <button class="text-button" type="button" @click="openRecordById(child.fromId)">
                Open
              </button>
            </li>
            <li
              v-for="rel in backlinkRecords.related || []"
              :key="`b-related-${rel.fromId}-${rel.field}`"
            >
              <div>
                <strong>{{ rel.fromId }}</strong>
                <span class="relationship-meta">related reference</span>
              </div>
              <button class="text-button" type="button" @click="openRecordById(rel.fromId)">
                Open
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <AssistantPanel
      v-if="isRecord && assistantDefinition"
      :record-type="recordType"
      :metadata="recordMetadata"
      :metadata-fields="metadataFieldList"
      :graph-node="graphNode"
      :assistant-config="assistantDefinition"
      :validate-record="validator.validate"
      @apply-metadata="applyAssistantMetadata"
      @apply-formdata="applyAssistantFormData"
    />

    <div v-if="isRecord && isFile" class="record-editor">
      <section>
        <header class="record-section-header">
          <div>
            <p class="section-label">Metadata</p>
            <h4>{{ recordType }}</h4>
          </div>
        </header>
        <RecordMetadataForm
          :schema="activeSchema"
          :ui-config="activeUiConfig"
          :read-only="isImmutable"
          :context-overrides="recordContextOverrides.value || {}"
          :schema-context="schemaBundle?.recordSchemas || {}"
          v-model="metadataModel"
        />
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
      </section>
    </div>

    <textarea
      v-else-if="isFile"
      class="file-textarea"
      :value="plainTextContent"
      :disabled="isLoading"
      @input="onPlainTextInput"
    ></textarea>
    <div v-else class="workbench-placeholder">
      <p>Use the repository tree to choose a Markdown, YAML, or JSON file.</p>
    </div>
  </div>
</template>

<style scoped>
.workbench-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.workbench-label {
  margin: 0;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  color: #94a3b8;
}

.workbench-header h3 {
  margin: 0.2rem 0 0;
  font-size: 1.1rem;
  color: #0f172a;
}

.workbench-actions {
  display: flex;
  gap: 0.5rem;
}

.workbench-alert {
  margin-top: 1rem;
  padding: 0.6rem 0.9rem;
  border-radius: 12px;
  font-size: 0.9rem;
}

.workbench-alert.ok {
  background: #ecfdf5;
  color: #047857;
}

.workbench-alert.error {
  background: #fef2f2;
  color: #b91c1c;
}

.validation-banner {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  font-size: 0.9rem;
  border: 1px solid transparent;
}

.validation-copy {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.validation-copy strong {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
}

.validation-banner.is-ok {
  background: #ecfdf5;
  border-color: rgba(16, 185, 129, 0.3);
  color: #047857;
}

.validation-banner.is-error {
  background: #fef2f2;
  border-color: rgba(239, 68, 68, 0.3);
  color: #b91c1c;
}

.validation-banner.is-pending {
  background: #fff7ed;
  border-color: rgba(251, 191, 36, 0.4);
  color: #c2410c;
}

.markdown-warning {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.85rem;
  color: #c2410c;
}

.file-textarea {
  margin-top: 1rem;
  width: 100%;
  min-height: 360px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 1rem;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.95rem;
  background: #f8fafc;
  color: #0f172a;
  resize: vertical;
}

.workbench-placeholder {
  margin-top: 2rem;
  padding: 1.5rem;
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  text-align: center;
  color: #94a3b8;
}

.record-editor {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.record-section-header {
  margin-bottom: 0.5rem;
}

.section-label {
  margin: 0;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.relationships-panel {
  margin-top: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  background: #fff;
}

.relationship-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.relationship-columns ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.relationship-columns li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid #f1f5f9;
}

.relationship-empty {
  font-size: 0.85rem;
  color: #94a3b8;
}

.relationship-meta {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
}
</style>
