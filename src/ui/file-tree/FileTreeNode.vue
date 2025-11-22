<script setup>
import { computed } from 'vue'

defineOptions({
  name: 'FileTreeNode'
})

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['select', 'expand'])

const isDirectory = computed(() => props.node.kind === 'directory')
const icon = computed(() => (isDirectory.value ? '📁' : '📄'))

function handleClick(event) {
  event?.stopPropagation()
  emit('select', props.node)
  if (!isDirectory.value) return
  if (!props.node.isLoaded && !props.node.isLoading) {
    emit('expand', props.node)
    return
  }
  props.node.isExpanded = !props.node.isExpanded
}
</script>

<template>
  <li
    class="file-tree-node"
    :class="{ 'is-directory': isDirectory, 'is-expanded': props.node.isExpanded }"
    role="treeitem"
    :aria-expanded="isDirectory ? props.node.isExpanded : undefined"
    :style="{ '--node-depth': depth }"
    @click="handleClick"
  >
    <div class="node-row" :class="{ loading: props.node.isLoading }">
      <span class="node-chevron" v-if="isDirectory">
        <span v-if="props.node.isLoading">⏳</span>
        <span v-else>{{ props.node.isExpanded ? '▼' : '▶' }}</span>
      </span>
      <span class="node-icon" aria-hidden="true">{{ icon }}</span>
      <span class="node-label">{{ node.name }}</span>
    </div>

    <transition name="tree-slide">
      <ul
        v-if="isDirectory && props.node.children && props.node.children.length && props.node.isExpanded"
        role="group"
        class="file-tree-children"
      >
        <FileTreeNode
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :depth="depth + 1"
          @select="emit('select', $event)"
          @expand="emit('expand', $event)"
        />
      </ul>
    </transition>
  </li>
</template>

<style scoped>
.file-tree-node {
  list-style: none;
  margin: 0;
  padding-left: calc(var(--node-depth) * 0.85rem);
  cursor: pointer;
  color: #0f172a;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.4rem;
  border-radius: 8px;
  transition: background 0.15s;
}

.node-row:hover {
  background: #e2e8f0;
}

.node-row.loading {
  opacity: 0.7;
}

.node-chevron {
  font-size: 0.75rem;
  color: #475569;
  width: 1.1rem;
}

.node-icon {
  width: 1.25rem;
  display: inline-flex;
  justify-content: center;
}

.node-label {
  font-size: 0.95rem;
}

.file-tree-children {
  list-style: none;
  margin: 0;
  padding-left: 0.75rem;
}

.tree-slide-enter-active,
.tree-slide-leave-active {
  transition: all 0.15s ease;
}

.tree-slide-enter-from,
.tree-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>