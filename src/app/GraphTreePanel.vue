<script setup>
import { computed, ref, watch } from 'vue'
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
  },
  tiptapRecordTypes: {
    type: Array,
    default: () => []
  },
  supportingDocumentEnabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'select-record',
  'create-child',
  'open-tiptap',
  'create-supporting-doc',
  'open-protocol',
  'use-as-source'
])

const expandedIds = ref(new Set())

const graphRef = computed(() => props.graphState?.graph?.value || null)
const graphStatus = computed(() => props.graphState?.status?.value || 'idle')
const graphError = computed(() => props.graphState?.error?.value || '')
const hasGraphData = computed(() => !!(graphRef.value?.nodes?.length))
const isGraphReady = computed(() => graphStatus.value === 'ready' || hasGraphData.value)

const relationships = computed(() => props.schemaLoader?.schemaBundle?.value?.relationships?.recordTypes || {})
const childRelationMap = computed(() => buildChildRelationMap(relationships.value))

const rootRecordTypes = computed(() => {
  const list = []
  Object.entries(relationships.value || {}).forEach(([recordType, descriptor]) => {
    const hasParents = descriptor?.parents && Object.keys(descriptor.parents).length > 0
    if (!hasParents) {
      list.push(recordType)
    }
  })
  return list
})

const rootGroups = computed(() => {
  const graph = graphRef.value
  if (!graph?.nodes?.length) return []
  const seen = new Set()
  const groups = []

  function addGroup(recordType, labelOverride) {
    const nodes = (graph.nodesByType?.[recordType] || []).filter((node) => {
      if (!node || seen.has(node.id)) return false
      seen.add(node.id)
      return true
    })
    if (nodes.length) {
      groups.push({
        recordType,
        label: labelOverride || typeLabel(recordType),
        nodes
      })
    }
  }

  if (props.defaultRootType) {
    addGroup(props.defaultRootType, props.defaultRootLabel || typeLabel(props.defaultRootType))
  }

  rootRecordTypes.value
    .filter((type) => type !== props.defaultRootType)
    .forEach((type) => addGroup(type))

  if (!groups.length) {
    groups.push({
      recordType: props.defaultRootType || 'record',
      label: props.defaultRootLabel || 'Records',
      nodes: [...graph.nodes]
    })
  }

  return groups
})

const visibleGroups = computed(() =>
  rootGroups.value.map((group) => ({
    ...group,
    rows: buildVisibleList(group.nodes)
  }))
)

const totalVisibleRows = computed(() => visibleGroups.value.reduce((sum, group) => sum + group.rows.length, 0))

watch(
  () => props.activePath,
  (path) => {
    const graph = graphRef.value
    if (!graph || !path) return
    const target = graph.nodesByPath?.[path]
    if (!target) return
    const next = new Set(expandedIds.value)
    expandAncestors(target, next)
    expandedIds.value = next
  }
)

watch(
  () => graphRef.value,
  () => {
    const graph = graphRef.value
    if (!graph?.nodesById) {
      expandedIds.value = new Set()
      return
    }
    const validIds = new Set(Object.keys(graph.nodesById))
    const next = new Set()
    expandedIds.value.forEach((id) => {
      if (validIds.has(id)) next.add(id)
    })
    expandedIds.value = next
  }
)

function buildChildRelationMap(descriptorMap = {}) {
  const map = {}
  Object.entries(descriptorMap).forEach(([recordType, descriptor]) => {
    Object.entries(descriptor.parents || {}).forEach(([relName, config]) => {
      const parentType = config.recordType
      if (!parentType) return
      if (!map[parentType]) map[parentType] = []
      map[parentType].push({
        relationship: relName,
        childType: recordType,
        parentField: config.field || '',
        actionId: config.actionId || null
      })
    })
  })
  return map
}

function getChildrenForNode(node, cache) {
  if (!node) return []
  if (cache.has(node.id)) return cache.get(node.id)
  const graph = graphRef.value
  if (!graph?.resolveRelationship) return []
  const relations = childRelationMap.value[node.recordType] || []
  const children = []
  relations.forEach((relation) => {
    const path = `backlinks.children.${relation.relationship}`
    const linkedNodes = graph.resolveRelationship(node, path) || []
    linkedNodes.forEach((childNode) => {
      children.push({ node: childNode, relation })
    })
  })
  cache.set(node.id, children)
  return children
}

function byLabel(a = {}, b = {}) {
  const aLabel = a.title || a.recordType || a.id || ''
  const bLabel = b.title || b.recordType || b.id || ''
  return aLabel.localeCompare(bLabel)
}

function typeLabel(recordType = '') {
  if (!recordType) return 'Records'
  return `${recordType.charAt(0).toUpperCase()}${recordType.slice(1)}`
}

function buildVisibleList(roots = []) {
  const graph = graphRef.value
  if (!graph || !roots.length) return []
  const cache = new Map()
  const list = []
  const sortedRoots = [...roots].sort(byLabel)

  const traverse = (node, depth) => {
    if (!node) return
    const children = getChildrenForNode(node, cache)
    list.push({
      node,
      depth,
      hasChildren: children.length > 0,
      children
    })
    if (expandedIds.value.has(node.id)) {
      const sortedChildren = [...children].sort((a, b) => byLabel(a.node, b.node))
      sortedChildren.forEach((entry) => traverse(entry.node, depth + 1))
    }
  }

  sortedRoots.forEach((node) => traverse(node, 0))
  return list
}

function expandAncestors(node, bucket) {
  if (!node) return
  bucket.add(node.id)
  if (!node.parents?.length) return
  node.parents.forEach((edge) => {
    if (edge.targetNode) {
      expandAncestors(edge.targetNode, bucket)
    }
  })
}

function toggleNode(nodeId) {
  if (!nodeId) return
  const next = new Set(expandedIds.value)
  if (next.has(nodeId)) {
    next.delete(nodeId)
  } else {
    next.add(nodeId)
  }
  expandedIds.value = next
}

function handleSelect(node) {
  if (!node?.path) return
  emit('select-record', node.path)
}

function handleOpenProtocol(node) {
  if (!node?.path) return
  emit('open-protocol', node)
}

function handleAddChild(parentNode, relation = null) {
  const targetRelation = relation || defaultChildRelation(parentNode)
  if (!parentNode || !targetRelation) return
  if (!canCreateChild(parentNode, targetRelation)) return
  emit('create-child', {
    recordType: targetRelation.childType,
    parentField: targetRelation.parentField,
    parentId: parentNode.id,
    parentRecordType: parentNode.recordType,
    actionId: targetRelation.actionId || null,
    parentNode
  })
}

function handleOpenTapTab(node) {
  if (!node?.path) return
  emit('open-tiptap', {
    path: node.path,
    recordType: node.recordType
  })
}

function handleAddSupportingDoc(node) {
  if (!props.supportingDocumentEnabled || !node) return
  emit('create-supporting-doc', { node })
}

function nodeSupportsTapTap(node) {
  if (!node) return false
  return props.tiptapRecordTypes.includes(node.recordType)
}

function isNodeImmutable(node) {
  if (!node) return false
  return isWorkflowStateImmutable(props.workflowLoader, node.recordType, node.frontMatter?.state)
}

function canCreateChild(parentNode, relation) {
  if (!parentNode || !relation) return false
  if (isNodeImmutable(parentNode)) return false
  if (!relation.parentField) return false
  const actionId = relation.actionId
  if (actionId && !workflowStateAllowsEvent(props.workflowLoader, parentNode.recordType, parentNode.frontMatter?.state, actionId)) {
    return false
  }
  return true
}

function creationDisabledReason(parentNode, relation) {
  if (!parentNode || !relation) return 'Creation unavailable for this relationship.'
  if (!relation.parentField) return 'Parent linkage field missing.'
  if (isNodeImmutable(parentNode)) return 'Parent record is immutable in its current workflow state.'
  const actionId = relation.actionId
  if (actionId && !workflowStateAllowsEvent(props.workflowLoader, parentNode.recordType, parentNode.frontMatter?.state, actionId)) {
    return `Workflow state does not allow the "${actionId}" transition.`
  }
  return ''
}

function rootHeading() {
  if (props.defaultRootLabel) return props.defaultRootLabel
  if (props.defaultRootType) {
    const label = props.defaultRootType.charAt(0).toUpperCase() + props.defaultRootType.slice(1)
    return `${label}s`
  }
  return 'Records'
}

function defaultChildRelation(node) {
  if (!node) return null
  return (childRelationMap.value[node.recordType] || [])[0] || null
}

function canAddDefaultChild(node) {
  const relation = defaultChildRelation(node)
  if (!relation) return false
  return canCreateChild(node, relation)
}

function addChildTitle(node) {
  const relation = defaultChildRelation(node)
  if (!relation) return 'No child record type configured for this node.'
  return canCreateChild(node, relation)
    ? `Add ${relation.childType}`
    : creationDisabledReason(node, relation)
}

function canAddSupportingDoc(node) {
  if (!props.supportingDocumentEnabled) return false
  return !!node
}

function supportingDocTitle(node) {
  if (!props.supportingDocumentEnabled) {
    return 'Add a supporting-document schema to enable this action.'
  }
  if (!node) return 'Select a record to attach supporting documents.'
  return 'Add supporting document'
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
    <div v-else-if="!totalVisibleRows" class="placeholder">
      <p>No records detected for {{ rootHeading().toLowerCase() }}.</p>
    </div>
    <div v-else class="tree-groups" aria-label="Record graph tree">
      <section v-for="group in visibleGroups" :key="group.recordType" class="tree-group">
        <header class="tree-group__header">
          <h4>{{ group.label }}</h4>
        </header>
        <div v-if="group.rows.length" class="tree-list">
          <div
            v-for="row in group.rows"
            :key="row.node.id + '-' + row.depth"
            class="tree-row"
            :class="{ 'is-active': row.node.path === activePath }"
            :style="{ paddingLeft: `${Math.min(row.depth, 6) * 1.1 + 0.5}rem` }"
          >
            <button
              class="toggle"
              type="button"
              :aria-label="row.hasChildren ? (expandedIds.has(row.node.id) ? 'Collapse' : 'Expand') : 'No children'"
              :disabled="!row.hasChildren"
              @click="row.hasChildren ? toggleNode(row.node.id) : null"
            >
              <span v-if="row.hasChildren">
                {{ expandedIds.has(row.node.id) ? '▾' : '▸' }}
              </span>
            </button>
            <button class="tree-label" type="button" @click="handleSelect(row.node)">
              <span class="tree-title">{{ row.node.title || row.node.id }}</span>
              <span class="tree-meta">{{ row.node.recordType }}</span>
              <span v-if="isNodeImmutable(row.node)" class="lock-pill" title="Immutable workflow state">Locked</span>
            </button>
            <div class="tree-actions">
              <button
                class="icon-button"
                type="button"
                title="Open record"
                @click="handleSelect(row.node)"
                :disabled="!row.node.path"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M10 4c-4.5 0-8 3.5-8 6s3.5 6 8 6 8-3.5 8-6-3.5-6-8-6zm0 9a3 3 0 110-6 3 3 0 010 6z"
                  />
                </svg>
              </button>
              <button
                v-if="row.node.recordType === 'run'"
                class="icon-button"
                type="button"
                title="Use as source in Run Editor"
                :disabled="!row.node.path"
                @click.stop="emit('use-as-source', row.node)"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 10h8.5L10 7.5l1-1 4 3.5-4 3.5-1-1L12.5 11H4z" />
                </svg>
              </button>
              <button
                v-if="row.node.recordType === 'protocol'"
                class="icon-button"
                type="button"
                title="Open protocol editor"
                :disabled="!row.node.path"
                @click="handleOpenProtocol(row.node)"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 5h9l3 3v7a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm9 0v3h3" />
                </svg>
              </button>
              <button
                class="icon-button"
                type="button"
                :title="addChildTitle(row.node)"
                :disabled="!canAddDefaultChild(row.node)"
                :aria-label="'Add child record to ' + (row.node.title || row.node.id)"
                @click="handleAddChild(row.node)"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 4v12m6-6H4" />
                </svg>
              </button>
              <button
                class="icon-button"
                type="button"
                :title="supportingDocTitle(row.node)"
                :disabled="!canAddSupportingDoc(row.node)"
                :aria-label="'Add supporting document to ' + (row.node.title || row.node.id)"
                @click="handleAddSupportingDoc(row.node)"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M6 3h6l4 4v10a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zm6 0v4h4" />
                </svg>
              </button>
              <button
                class="icon-button"
                type="button"
                title="Edit in TapTab"
                :disabled="!nodeSupportsTapTap(row.node)"
                @click="handleOpenTapTab(row.node)"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 13.5V16h2.5l8-8-2.5-2.5-8 8zM15 6l-2-2 1.5-1.5a1 1 0 011.4 0l0.6 0.6a1 1 0 010 1.4L15 6z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <p v-else class="group-empty">No {{ group.label.toLowerCase() }} yet.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.graph-tree {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.placeholder {
  border: 1px dashed #cbd5f5;
  border-radius: 10px;
  padding: 0.75rem;
  color: #475569;
  font-size: 0.9rem;
}

.tree-list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.tree-groups {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.tree-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}

.tree-group__header h4 {
  margin: 0;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
}

.group-empty {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.tree-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.25rem;
  border-radius: 8px;
  padding: 0.15rem 0.25rem;
}

.tree-row.is-active {
  background: #eff6ff;
}

.toggle {
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  font-size: 0.95rem;
  line-height: 1;
  color: #475569;
  cursor: pointer;
}

.toggle:disabled {
  cursor: default;
  color: transparent;
}

.tree-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.2rem 0.1rem;
  cursor: pointer;
}

.tree-title {
  font-weight: 600;
  color: #0f172a;
  font-size: 0.92rem;
}

.tree-meta {
  font-size: 0.72rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tree-actions {
  display: inline-flex;
  gap: 0.25rem;
}

.icon-button {
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-button svg {
  width: 1rem;
  height: 1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}

.icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.lock-pill {
  display: inline-flex;
  align-items: center;
  background: #fee2e2;
  color: #b91c1c;
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
