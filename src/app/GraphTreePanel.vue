<script setup>
import { computed } from 'vue'
import { useGraphView } from '../graph/useGraphView'
import { isWorkflowStateImmutable, workflowStateAllowsEvent } from '../workflows/workflowUtils'

const props = defineProps({
  graphState: {
    type: Object,
    required: true
  },
  schemaLoader: {
    type: Object,
    required: true
  },
  workflowLoader: {
    type: Object,
    default: null
  },
  defaultRootType: {
    type: String,
    default: ''
  },
  defaultRootLabel: {
    type: String,
    default: ''
  },
  activePath: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select-record', 'create-child'])

const graphRef = computed(() => props.graphState?.graph?.value || null)
const graphStatus = computed(() => props.graphState?.status?.value || 'idle')
const graphError = computed(() => props.graphState?.error?.value || '')
const hasGraphData = computed(() => !!(graphRef.value?.nodes?.length))
const isGraphReady = computed(() => graphStatus.value === 'ready' || hasGraphData.value)

const activeNode = computed(() => {
  const graph = graphRef.value
  if (!graph || !props.activePath) return null
  return graph.nodesByPath?.[props.activePath] || null
})

const rootNode = computed(() => activeNode.value || null)
const rootId = computed(() => rootNode.value?.id || '')
const rootType = computed(() => rootNode.value?.recordType || props.defaultRootType || '')

const { view } = useGraphView({
  graph: graphRef,
  schemaLoader: props.schemaLoader,
  rootId,
  recordType: rootType
})

const viewSections = computed(() => view.value?.sections || [])
const defaultRootNodes = computed(() => {
  if (rootNode.value) return []
  const graph = graphRef.value
  if (!graph?.nodes?.length) return []
  const type = props.defaultRootType
  if (type && graph.nodesByType?.[type]?.length) {
    return graph.nodesByType[type]
  }
  return graph.nodes
})
const defaultRootTitle = computed(() => {
  if (rootNode.value) return ''
  if (props.defaultRootLabel) return props.defaultRootLabel
  if (props.defaultRootType) return `${capitalize(props.defaultRootType)} records`
  return 'Records'
})

function capitalize(value = '') {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatNodeLabel(node, template) {
  if (!template) return node?.title || node?.id || ''
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
    if (!node) return ''
    // Handle || operator for fallback values
    const parts = expression.split('||').map(p => p.trim())
    for (const part of parts) {
      let value = ''
      if (part === 'title') value = node.title || ''
      else if (part === 'id') value = node.id || ''
      else if (part === 'recordType') value = node.recordType || ''
      else value = node[part] || node.frontMatter?.[part] || ''
      
      if (value) return value
    }
    return ''
  })
}

function handleSelect(node) {
  if (!node?.path) return
  emit('select-record', node.path)
}

function handleCreate(entry) {
  const config = entry?.config?.allowCreate
  if (!config) return
  const parentNode = entry?.sourceNode || rootNode.value
  if (!canCreateChild(entry)) return
  emit('create-child', {
    recordType: config.recordType,
    parentField: config.parentField,
    parentId: parentNode?.id || '',
    parentRecordType: parentNode?.recordType || ''
  })
}

function isNodeImmutable(node) {
  if (!node) return false
  return isWorkflowStateImmutable(props.workflowLoader, node.recordType, node.frontMatter?.state)
}

function canCreateChild(entry) {
  const parentNode = entry?.sourceNode || rootNode.value
  if (!entry?.config?.allowCreate || !parentNode) return false
  if (isNodeImmutable(parentNode)) return false
  const actionId = entry.config.allowCreate.actionId
  if (actionId && !workflowStateAllowsEvent(props.workflowLoader, parentNode.recordType, parentNode.frontMatter?.state, actionId)) {
    return false
  }
  return true
}

function creationDisabledReason(entry) {
  const parentNode = entry?.sourceNode || rootNode.value
  if (!entry?.config?.allowCreate || !parentNode) return 'Creation unavailable for this relationship.'
  if (isNodeImmutable(parentNode)) return 'Parent record is immutable in its current workflow state.'
  const actionId = entry.config.allowCreate.actionId
  if (actionId && !workflowStateAllowsEvent(props.workflowLoader, parentNode.recordType, parentNode.frontMatter?.state, actionId)) {
    return `Workflow state does not allow the "${actionId}" transition.`
  }
  return ''
}
</script>

<template>
  <div class="graph-tree">
    <p v-if="graphError" class="status status-error">
      {{ graphError }}
    </p>
    <p v-else-if="!isGraphReady" class="status status-muted">
      {{ graphStatus === 'building' ? 'Building record graph…' : 'Graph is initializing.' }}
    </p>
    <div v-else-if="!rootNode">
      <div v-if="defaultRootNodes.length" class="graph-tree__content">
        <header class="graph-tree__header">
          <div>
            <p class="graph-tree__label">Root type</p>
            <h3>{{ defaultRootTitle }}</h3>
            <p class="graph-tree__meta">{{ defaultRootNodes.length }} records</p>
          </div>
        </header>
        <section class="graph-section">
          <div class="graph-node-list">
            <button
              v-for="node in defaultRootNodes"
              :key="node.id"
              class="graph-node"
              type="button"
              @click="handleSelect(node)"
            >
              <span class="graph-node__title">{{ node.title || node.id }}</span>
              <span class="graph-node__meta">{{ node.recordType }}</span>
              <span v-if="isNodeImmutable(node)" class="lock-pill lock-pill--inline" title="Immutable workflow state">
                Locked
              </span>
            </button>
          </div>
        </section>
      </div>
      <div v-else class="placeholder">
        <p>No records detected for this bundle.</p>
      </div>
    </div>
    <div v-else class="graph-tree__content">
      <header class="graph-tree__header">
        <div>
          <p class="graph-tree__label">Root record</p>
          <h3>{{ rootNode.title || rootNode.id }}</h3>
          <p class="graph-tree__meta">
            {{ rootNode.recordType }} · {{ rootNode.id }}
            <span v-if="isNodeImmutable(rootNode)" class="lock-pill">Locked</span>
          </p>
        </div>
        <button class="secondary" type="button" @click="handleSelect(rootNode)">Open</button>
      </header>

      <section v-for="section in viewSections" :key="section.id" class="graph-section">
        <header class="graph-section__header">
          <h4>{{ section.label }}</h4>
        </header>
        <div v-if="!section.entries.length" class="graph-section__empty">
          <p>No relationships configured.</p>
        </div>
        <div v-else>
          <div v-for="entry in section.entries" :key="entry.id" class="graph-edge">
            <div class="graph-edge__header">
              <p class="graph-edge__label">{{ entry.config.relationship || 'related' }}</p>
              <button
                v-if="entry.config?.allowCreate"
                class="text-button"
                type="button"
                :disabled="!canCreateChild(entry)"
                :title="creationDisabledReason(entry)"
                @click="handleCreate(entry)"
              >
                + Add {{ entry.config.allowCreate.recordType }}
              </button>
            </div>
            <div v-if="entry.nodes.length" class="graph-node-list">
              <button
                v-for="node in entry.nodes"
                :key="node.id"
                class="graph-node"
                :class="{ 'is-active': node.path === activePath }"
                type="button"
                @click="handleSelect(node)"
              >
                <span class="graph-node__title">
                  {{ formatNodeLabel(node, entry.config.labelTemplate) }}
                </span>
                <span class="graph-node__meta">{{ node.recordType }}</span>
                <span v-if="isNodeImmutable(node)" class="lock-pill lock-pill--inline" title="Immutable workflow state">
                  Locked
                </span>
              </button>
            </div>
            <p v-else class="graph-edge__empty">No nodes yet.</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.graph-tree {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.placeholder {
  border: 1px dashed #cbd5f5;
  border-radius: 12px;
  padding: 1rem;
  color: #475569;
  text-align: center;
}

.graph-tree__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.graph-tree__label {
  margin: 0;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.graph-tree__meta {
  margin: 0.2rem 0 0;
  color: #64748b;
}

.graph-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.graph-section__header h4 {
  margin: 0;
  font-size: 1rem;
}

.graph-edge {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.graph-edge__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.graph-edge__label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.graph-edge__empty,
.graph-section__empty {
  color: #94a3b8;
  font-size: 0.9rem;
}

.graph-node-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.graph-node {
  width: 100%;
  text-align: left;
  border: 1px solid #cbd5f5;
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  background: #fff;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  cursor: pointer;
}

.graph-node.is-active {
  border-color: #2563eb;
  background: #eff6ff;
}

.graph-node__title {
  font-weight: 600;
  color: #0f172a;
}

.graph-node__meta {
  font-size: 0.85rem;
  color: #475569;
}

.lock-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lock-pill--inline {
  margin-left: auto;
}

.text-button {
  border: none;
  background: transparent;
  color: #2563eb;
  font-weight: 600;
  cursor: pointer;
}

.text-button:hover {
  text-decoration: underline;
}
</style>
