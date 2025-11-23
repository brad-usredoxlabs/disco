<template>
  <node-view-wrapper
    as="span"
    class="ontology-term"
    :title="tooltip"
  >
    <span class="ontology-code">{{ node.attrs.ontology || 'TERM' }}</span>
    <span class="ontology-label">{{ node.attrs.label || node.attrs.identifier }}</span>
    <a
      v-if="node.attrs.url"
      class="ontology-link"
      :href="node.attrs.url"
      target="_blank"
      rel="noopener noreferrer"
      @click.stop
    >
      ↗
    </a>
  </node-view-wrapper>
</template>

<script setup>
import { computed } from 'vue'
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps({
  node: {
    type: Object,
    required: true
  }
})

const tooltip = computed(() => {
  const id = props.node.attrs.identifier ? ` (${props.node.attrs.identifier})` : ''
  return `${props.node.attrs.label || 'Ontology term'}${id}`
})
</script>

<style scoped>
.ontology-term {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  font-size: 0.8rem;
  color: #312e81;
}

.ontology-code {
  font-weight: 600;
  letter-spacing: 0.02em;
}

.ontology-link {
  text-decoration: none;
  font-size: 0.7rem;
  opacity: 0.7;
}

.ontology-link:hover {
  opacity: 1;
}
</style>
