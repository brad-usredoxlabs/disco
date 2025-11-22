<script setup>
import FileTreeNode from './FileTreeNode.vue'

defineProps({
  nodes: {
    type: Array,
    default: () => []
  },
  title: {
    type: String,
    default: 'repository'
  }
})

const emit = defineEmits(['select'])

function handleSelect(node) {
  emit('select', node)
}
</script>

<template>
  <div class="file-tree-browser">
    <div class="file-tree-header">
      <span class="file-tree-title">{{ title }}</span>
    </div>
    <ul class="file-tree-list" role="tree" aria-label="Repository tree">
      <FileTreeNode
        v-for="node in nodes"
        :key="node.id || node.name"
        :node="node"
        @select="handleSelect"
      />
    </ul>
  </div>
</template>

<style scoped>
.file-tree-browser {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: #fdfdfd;
}

.file-tree-header {
  padding: 0.85rem 1rem;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.file-tree-title {
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #475569;
}

.file-tree-list {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0.75rem 1rem;
}
</style>