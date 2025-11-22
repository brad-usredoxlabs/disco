<script setup>
import { computed, ref } from 'vue'

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

const emit = defineEmits(['select'])

const isDirectory = computed(() => props.node.type !== 'file')
const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0)
const isExpanded = ref(isDirectory.value)

function toggle(event) {
  event?.stopPropagation()
  if (isDirectory.value && hasChildren.value) {
    isExpanded.value = !isExpanded.value
  }
  emit('select', props.node)
}
</script>

<template>
  <li
    class="file-tree-node"
    :class="{ 'is-directory': isDirectory, 'is-expanded': isExpanded }"
    role="treeitem"
    :aria-expanded="isDirectory ? isExpanded : undefined"
    :style="{ '--node-depth': depth }"
    @click="toggle"
  >
    <div class="node-row">
      <span class="node-chevron" v-if="isDirectory">
        {{ hasChildren ? (isExpanded ? '▼' : '▶') : '•' }}
      </span>
      <span class="node-icon" aria-hidden="true">{{ isDirectory ? '📁' : '📄' }}</span>
      <span class="node-label">{{ node.name }}</span>
    </div>

    <transition name="tree-slide">
      <ul
        v-if="isDirectory && hasChildren && isExpanded"
        role="group"
        class="file-tree-children"
      >
        <FileTreeNode
          v-for="child in node.children"
          :key="child.id || child.name"
          :node="child"
          :depth="depth + 1"
          @select="emit('select', $event)"
        />
      </ul>
    </transition>
  </li>
</template>

<style scoped>
.file-tree-node {
  list-style: none;
  margin: 0;
  padding-left: calc(var(--node-depth) * 0.75rem);
  cursor: pointer;
  color: #0f172a;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.25rem;
  border-radius: 8px;
}

.node-row:hover {
  background: #e2e8f0;
}

.node-chevron {
  font-size: 0.75rem;
  color: #475569;
  width: 1rem;
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
  padding-left: 1rem;
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