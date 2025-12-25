<script setup>
import { computed } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  wellId: {
    type: String,
    default: ''
  },
  labwareId: {
    type: String,
    default: ''
  },
  wellState: {
    type: Object,
    default: null
  },
  lineage: {
    type: Object,
    default: () => ({ nodes: [], edges: [] })
  },
  wellKey: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close'])

const components = computed(() => props.wellState?.components || [])
const totalVolume = computed(() => props.wellState?.totalVolumeL || 0)

function concentration(comp) {
  if (!comp || !totalVolume.value) return null
  return (comp.moles || 0) / totalVolume.value
}

const lineageEdges = computed(() => props.lineage?.edges || [])

function close() {
  emit('close')
}
</script>

<template>
  <div v-if="open" class="drawer">
    <div class="drawer__header">
      <div>
        <h3>Well {{ wellId }}</h3>
        <p class="subtitle">{{ labwareId }}</p>
      </div>
      <button type="button" class="ghost" @click="close">Close</button>
    </div>

    <div class="section">
      <h4>Composition</h4>
      <p v-if="!components.length" class="muted">No components.</p>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Moles</th>
            <th>Conc (M)</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, idx) in components" :key="idx">
            <td>{{ c.materialId }}</td>
            <td>{{ (c.moles || 0).toExponential(3) }}</td>
            <td>{{ concentration(c)?.toExponential(3) || '—' }}</td>
            <td>{{ c.sourceLabware }}:{{ c.sourceWell }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <h4>Lineage preview</h4>
      <p class="muted">Edges: {{ lineageEdges.length }} · Nodes: {{ lineage.nodes.length }}</p>
      <ul v-if="lineageEdges.length" class="lineage-list">
        <li v-for="(edge, idx) in lineageEdges" :key="idx">
          <code>{{ edge.from?.labwareId || edge.from?.sampleId }}</code>
          <span v-if="edge.from?.wellId">:{{ edge.from?.wellId }}</span>
          → <code>{{ edge.to?.labwareId || edge.to?.sampleId }}</code>
          <span v-if="edge.to?.wellId">:{{ edge.to?.wellId }}</span>
          <span v-if="edge.materialId"> ({{ edge.materialId }})</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.drawer {
  border-left: 1px solid #cbd5e1;
  padding: 0.75rem;
  background: #fff;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.drawer__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
}

.ghost {
  border: 1px solid #cbd5e1;
  background: transparent;
  border-radius: 8px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.muted {
  color: #94a3b8;
  font-size: 0.9rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  border: 1px solid #e2e8f0;
  padding: 0.35rem;
  font-size: 0.9rem;
  text-align: left;
}

.lineage-list {
  margin: 0.35rem 0 0;
  padding-left: 1rem;
  color: #334155;
  font-size: 0.9rem;
}

.table th {
  background: #f8fafc;
}
</style>
