<script setup>
import { computed, reactive, watch } from 'vue'
import BaseModal from '../ui/modal/BaseModal.vue'
import { buildDefaultFrontMatter, computeRecordPath, sanitizeSlug } from '../records/recordCreation'
import { generateMarkdownView, buildBodyDefaults } from '../records/markdownView'
import { previewId, commitId } from '../records/idGenerator'
import { serializeFrontMatter } from '../records/frontMatter'

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
  workflowLoader: {
    type: Object,
    required: true
  },
  recordGraph: {
    type: Object,
    required: true
  },
  onCreated: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['close'])

const state = reactive({
  recordType: '',
  metadata: {},
  body: '# New record\n\nDescribe the record here.',
  filePath: '',
  isCreating: false,
  error: '',
  autoId: '',
  pendingCounter: null
})

const bundle = computed(() => props.schemaLoader.schemaBundle?.value)
const namingRules = computed(() => bundle.value?.naming || {})
const relationships = computed(() => bundle.value?.relationships || { recordTypes: {} })
const workflowMachines = computed(() => props.workflowLoader.workflowBundle?.value?.machines || {})
const graphData = computed(() => props.recordGraph?.graph?.value || { nodes: [], nodesById: {} })
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
    const workflowMachine = workflowMachines.value?.[type]
    state.metadata = buildDefaultFrontMatter(type, namingRule, workflowMachine)
    const bodyDefaults = buildBodyDefaults(type, bundle.value || {})
    if (Object.keys(bodyDefaults).length) {
      state.metadata.formData = bodyDefaults
    } else {
      delete state.metadata.formData
    }
    state.body = generateMarkdownView(type, state.metadata, state.metadata.formData || {}, bundle.value || {})
    await seedAutoId(namingRule)
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

async function handleCreate() {
  if (!isReady.value || state.isCreating) return
  try {
    state.isCreating = true
    state.error = ''
    const markdownView = generateMarkdownView(
      state.recordType,
      state.metadata,
      state.metadata.formData || {},
      bundle.value || {}
    )
    const content = serializeFrontMatter(state.metadata, markdownView)
    await props.repo.writeFile(state.filePath, content)
    const namingRule = namingRules.value[state.recordType]
    if (state.metadata.id === state.autoId && state.pendingCounter) {
      await commitId(props.repo, namingRule, state.pendingCounter)
    }
    props.onCreated?.(state.filePath)
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

</script>

<template>
  <BaseModal v-if="open" title="Create new record" @close="close">
    <div class="creator-body">
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

      <div v-if="state.recordType" class="creator-form">
        <label>Title</label>
        <input type="text" v-model="state.metadata.title" />

        <label>Record ID</label>
        <input type="text" v-model="state.metadata.id" />

        <div v-if="namingRules[state.recordType]?.shortSlugField">
          <label>Short slug</label>
          <input type="text" v-model="state.metadata[namingRules[state.recordType].shortSlugField]" />
        </div>

        <div v-for="parent in parentDefinitions" :key="parent.relName" class="parent-select">
          <label>{{ parent.relName }} ({{ parent.recordType }})</label>
          <select v-model="state.metadata[parent.field]">
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

        <label>Target file</label>
        <input type="text" :value="state.filePath" readonly />

        <label>Body template</label>
        <textarea rows="6" v-model="state.body"></textarea>
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

.creator-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
