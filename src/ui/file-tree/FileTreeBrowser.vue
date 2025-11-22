<script setup>
import FileTreeNode from './FileTreeNode.vue'

const props = defineProps({
  nodes: {
    type: Array,
    default: () => []
  },
  title: {
    type: String,
    default: 'repository'
  },
  isLoading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select', 'expand'])

function handleSelect(node) {
  emit('select', node)
}

function handleExpand(node) {
  emit('expand', node)
}
</script>

<template>
  <div class="file-tree-browser">
    <div class="file-tree-header">
      <span class="file-tree-title">{{ title }}</span>
      <span v-if="isLoading" class="loading-indicator">Loading…</span>
    </div>
    <div class="file-tree-body" role="tree" aria-label="Repository tree">
      <p v-if="isLoading && !nodes.length" class="tree-placeholder">Scanning repository…</p>
      <p v-else-if="!props.isLoading && !nodes.length" class="tree-placeholder">
        Select a repository to populate the tree.
      </p>
      <ul v-else class="file-tree-list">
        <FileTreeNode
          v-for="node in nodes"
          :key="node.path"
          :node="node"
          @select="handleSelect"
          @expand="handleExpand"
        />
      </ul>
    </div>
  </div>
</template>

<style scoped>
.file-tree-browser {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: #fdfdfd;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.file-tree-header {
  padding: 0.85rem 1rem;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.file-tree-title {
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
}

.loading-indicator {
  font-size: 0.8rem;
  color: #64748b;
}

.file-tree-body {
  flex: 1;
  overflow: auto;
}

.tree-placeholder {
  padding: 1.25rem;
  color: #94a3b8;
  text-align: center;
}

.file-tree-list {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0.75rem 1rem;
}
</style>