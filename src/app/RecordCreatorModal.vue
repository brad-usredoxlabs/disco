<script setup>
import { computed, reactive, ref, watch } from 'vue'
import BaseModal from '../ui/modal/BaseModal.vue'
import { buildDefaultFrontMatter, computeRecordPath, sanitizeSlug } from '../records/recordCreation'
import { buildBodyDefaults } from '../records/markdownView'
import { previewId, commitId } from '../records/idGenerator'
import { serializeFrontMatter } from '../records/frontMatter'
import { composeRecordFrontMatter } from '../records/jsonLdFrontmatter'
import { buildRecordContextOverrides, mergeContextOverrides } from '../records/biologyInheritance'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  repo: {
    type: Object,
    required: true
  },
  schemaLoader: {
    type: Object,
    required: true
  },
  recordGraph: {
    type: Object,
    required: true
  },
  namespacingConfig: {
    type: Object,
    default: () => ({})
  },
  onCreated: {
    type: Function,
    default: null
  },
  creationContext: {
    type: Object,
    default: null
  },
  parentContext: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const state = reactive({
  recordType: '',
  metadata: {},
  filePath: '',
  isCreating: false,
  error: '',
  autoId: '',
  pendingCounter: null,
  showAdvanced: false
})
const creationContextPatch = ref(null)
const pendingParentLink = ref(null)
const lockedParentFields = ref({})
const incomingContext = computed(() => props.creationContext || props.parentContext || null)
const simpleMode = computed(() => !!incomingContext.value?.simpleMode)

const bundle = computed(() => props.schemaLoader.schemaBundle?.value)
const namingRules = computed(() => bundle.value?.naming || {})
const relationships = computed(() => bundle.value?.relationships || { recordTypes: {} })
const graphData = computed(() => props.recordGraph?.graph?.value || { nodes: [], nodesById: {} })
const creatorContextOverrides = computed(() => {
  const nodesById = graphData.value?.nodesById || {}
  let overrides = {}
  parentDefinitions.value.forEach((parent) => {
    const parentId = state.metadata?.[parent.field]
    if (!parentId) return
    const parentNode = nodesById[parentId]
    if (!parentNode) return
    const parentOverride = buildRecordContextOverrides(parentNode)
    if (parentOverride && Object.keys(parentOverride).length) {
      overrides = mergeContextOverrides(overrides, parentOverride)
    }
  })
  return overrides
})
const tiptapRecordTypes = computed(() => bundle.value?.manifest?.tiptap?.recordTypes || [])

const loaderStatus = computed(() => props.schemaLoader?.status?.value || 'idle')

const availableRecordTypes = computed(() => {
  const namingEntries = Object.keys(namingRules.value || {})
  if (namingEntries.length) return namingEntries
  return Object.keys(bundle.value?.recordSchemas || {})
})

const isBundleReady = computed(() => ['ready', 'warning'].includes(loaderStatus.value))
const parentDefinitions = computed(() => {
  if (!state.recordType) return []
  const descriptor = relationships.value.recordTypes?.[state.recordType]
  if (!descriptor?.parents) return []
  return Object.entries(descriptor.parents).map(([relName, cfg]) => ({ relName, ...cfg }))
})

const parentOptions = computed(() => {
  const options = {}
  for (const node of graphData.value.nodes || []) {
    const list = (options[node.recordType] ||= [])
    list.push(node)
  }
  for (const list of Object.values(options)) {
    list.sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id))
  }
  return options
})

const isReady = computed(() => {
  if (!state.recordType) return false
  if (!state.metadata.id) return false
  if (!state.metadata.title) return false
  return Boolean(state.filePath)
})

watch(
  () => state.recordType,
  async (type) => {
    if (!type) return
    const namingRule = namingRules.value[type]
    state.metadata = buildDefaultFrontMatter(type, namingRule)
    const bodyDefaults = buildBodyDefaults(type, bundle.value || {})
    if (Object.keys(bodyDefaults).length) {
      state.metadata.formData = bodyDefaults
    } else {
      delete state.metadata.formData
    }
    await seedAutoId(namingRule)
    applyCreationContextPatch()
    ensureParentFields()
    recomputePath()
  }
)

watch(parentDefinitions, () => {
  ensureParentFields()
})

watch(
  () => state.metadata,
  () => {
    recomputePath()
    updateDerivedFields()
  },
  { deep: true }
)

watch(
  () => state.metadata.title,
  (title) => {
    if (!state.recordType) return
    const slug = sanitizeSlug(title || '')
    if (slug && !state.metadata.id) {
      state.metadata.id = slug
    }
    const slugField = namingRules.value[state.recordType]?.shortSlugField
    if (slugField && slug && !state.metadata[slugField]) {
      state.metadata[slugField] = slug.slice(0, 8)
    }
  }
)

function ensureParentFields() {
  parentDefinitions.value.forEach((parent) => {
    if (!(parent.field in state.metadata)) {
      state.metadata[parent.field] = ''
    }
  })
  updateDerivedFields()
}

function recomputePath() {
  const namingRule = namingRules.value[state.recordType]
  if (!namingRule) {
    state.filePath = ''
    return
  }
  state.filePath = computeRecordPath(state.metadata, namingRule)
}

function close() {
  emit('close')
  resetForm()
}

function resetForm() {
  state.recordType = ''
  state.metadata = {}
  state.filePath = ''
  state.error = ''
  state.isCreating = false
  state.showAdvanced = false
  creationContextPatch.value = null
  pendingParentLink.value = null
  lockedParentFields.value = {}
}

function handleMetadataInput(field, value) {
  state.metadata = {
    ...state.metadata,
    [field]: value
  }
}

function handleParentSelect(field, value) {
  state.metadata = {
    ...state.metadata,
    [field]: value
  }
  updateDerivedFields()
}

watch(
  incomingContext,
  (context) => {
    if (!context) {
      creationContextPatch.value = null
      return
    }
    if (context.recordType && context.recordType !== state.recordType) {
      state.recordType = context.recordType
    }
    const metadataPatch = context.metadata && typeof context.metadata === 'object' ? context.metadata : {}
    creationContextPatch.value = metadataPatch
    pendingParentLink.value = context.parentLink || null
    if (!context.recordType) {
      applyCreationContextPatch()
    }
  },
  { deep: true, immediate: true }
)

function applyCreationContextPatch() {
  const patch = creationContextPatch.value
  let didUpdate = false
  if (patch && Object.keys(patch).length) {
    state.metadata = {
      ...state.metadata,
      ...patch
    }
    creationContextPatch.value = null
    didUpdate = true
  }
  if (applyPendingParentLink()) {
    didUpdate = true
  }
  if (didUpdate) {
    updateDerivedFields()
  }
}

watch(
  () => simpleMode.value,
  (flag) => {
    if (flag) {
      state.showAdvanced = false
    }
  },
  { immediate: true }
)

function applyPendingParentLink() {
  const link = pendingParentLink.value
  if (!link || !link.field || !link.id) return false
  state.metadata[link.field] = link.id
  lockedParentFields.value = {
    ...lockedParentFields.value,
    [link.field]: {
      id: link.id,
      label: link.node?.title || link.id
    }
  }
  pendingParentLink.value = null
  return true
}

function unlockParentField(field) {
  if (!field) return
  const copy = { ...lockedParentFields.value }
  delete copy[field]
  lockedParentFields.value = copy
}

async function handleCreate() {
  if (!isReady.value || state.isCreating) return
  try {
    state.isCreating = true
    state.error = ''
    const frontMatterPayload = composeRecordFrontMatter(
      state.recordType,
      state.metadata,
      state.metadata.formData || {},
      bundle.value || {},
      creatorContextOverrides.value || {},
      props.namespacingConfig || {}
    )
    const content = serializeFrontMatter(frontMatterPayload)
    await props.repo.writeFile(state.filePath, content)
    const namingRule = namingRules.value[state.recordType]
    if (state.metadata.id === state.autoId && state.pendingCounter) {
      await commitId(props.repo, namingRule, state.pendingCounter)
    }
    if (typeof props.onCreated === 'function') {
      await props.onCreated({
        path: state.filePath,
        recordType: state.recordType,
        metadata: cloneMetadata(state.metadata)
      })
    }
    close()
  } catch (err) {
    state.error = err?.message || 'Unable to create record.'
  } finally {
    state.isCreating = false
  }
}

async function seedAutoId(namingRule) {
  state.autoId = ''
  state.pendingCounter = null
  if (!namingRule) return
  const preview = await previewId(props.repo, namingRule)
  if (preview?.id) {
    state.metadata.id = preview.id
    state.autoId = preview.id
    state.pendingCounter = preview.counter
  }
}

function updateDerivedFields() {
  const namingRule = namingRules.value[state.recordType]
  const derived = namingRule?.derivedFields
  if (!derived) return
  const nodesById = graphData.value?.nodesById || {}
  for (const [field, rule] of Object.entries(derived)) {
    const viaField = rule?.linkage?.viaField
    if (!viaField) continue
    const sourceId = state.metadata?.[viaField]
    if (!sourceId) continue
    const sourceNode = nodesById[sourceId]
    if (!sourceNode) continue
    const sourceValue = sourceNode.frontMatter?.[rule.sourceField]
    if (sourceValue === undefined) continue
    if (state.metadata[field] === sourceValue) continue
    state.metadata[field] = sourceValue
  }
}

function cloneMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {}
  return JSON.parse(JSON.stringify(metadata))
}

</script>

<template>
  <BaseModal v-if="open" title="Create new record" @close="close">
  <div class="creator-body">
    <template v-if="!simpleMode">
      <label>Record type</label>
      <select v-model="state.recordType" :disabled="!availableRecordTypes.length">
        <option value="" disabled>Select type…</option>
        <option v-for="type in availableRecordTypes" :key="type" :value="type">
          {{ type }}
        </option>
      </select>
      <p v-if="!availableRecordTypes.length" class="status status-muted">
        {{ isBundleReady ? 'No record types detected. Connect to a repository with a valid naming configuration.' : 'Loading schema bundle…' }}
      </p>
    </template>
    <div v-else class="simple-mode-pill">
      <span>Record type: {{ state.recordType || 'record' }}</span>
    </div>

    <div v-if="state.recordType" class="creator-form">
      <label>Title</label>
      <input type="text" v-model="state.metadata.title" />

      <div v-if="namingRules[state.recordType]?.shortSlugField">
        <label>Short slug</label>
        <input type="text" v-model="state.metadata[namingRules[state.recordType].shortSlugField]" />
      </div>

      <div v-for="parent in parentDefinitions" :key="parent.relName" class="parent-select">
        <label>{{ parent.relName }} ({{ parent.recordType }})</label>
        <div v-if="lockedParentFields[parent.field]" class="locked-parent">
          <span class="locked-parent__label">
            {{ lockedParentFields[parent.field].label }}
          </span>
          <button class="text-button" type="button" @click="unlockParentField(parent.field)">
            Change
          </button>
        </div>
        <select v-else v-model="state.metadata[parent.field]">
          <option value="" disabled>Select {{ parent.relName }}</option>
          <option
            v-for="candidate in parentOptions[parent.recordType] || []"
            :key="candidate.id"
            :value="candidate.id"
          >
            {{ candidate.title || candidate.id }}
          </option>
        </select>
      </div>

      <button
        v-if="!simpleMode"
        class="toggle-advanced"
        type="button"
        @click="state.showAdvanced = !state.showAdvanced"
      >
        {{ state.showAdvanced ? 'Hide advanced options' : 'Show advanced options' }}
      </button>

      <div v-if="state.showAdvanced && !simpleMode" class="advanced-panel">
        <label>Record ID</label>
        <input type="text" v-model="state.metadata.id" />

        <label>Target file</label>
        <input type="text" :value="state.filePath" readonly />
      </div>
    </div>

      <p v-if="state.error" class="status status-error">{{ state.error }}</p>
    </div>

    <template #footer>
      <button class="secondary" type="button" @click="close">Cancel</button>
      <button class="primary" type="button" :disabled="!isReady || state.isCreating" @click="handleCreate">
        {{ state.isCreating ? 'Creating…' : 'Create record' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.creator-body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

label {
  font-weight: 600;
  color: #475569;
}

select,
input,
textarea {
  border-radius: 10px;
  border: 1px solid #cbd5f5;
  padding: 0.45rem 0.65rem;
  font-size: 0.95rem;
  width: 100%;
}

.parent-select {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.locked-parent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.35rem 0.65rem;
  background: #f8fafc;
}

.locked-parent__label {
  font-weight: 600;
  color: #0f172a;
}

.simple-mode-pill {
  border: 1px solid #cbd5f5;
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  background: #f1f5f9;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
  align-self: flex-start;
}

.creator-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.toggle-advanced {
  align-self: flex-start;
  background: transparent;
  color: #2563eb;
  border: none;
  font-weight: 600;
  cursor: pointer;
  padding: 0.2rem 0;
}

.toggle-advanced:hover {
  text-decoration: underline;
}

.advanced-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.35rem;
  padding: 0.75rem;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
</style>
