<script setup>
import { computed } from 'vue'
import { formatWellId } from '../utils/layoutUtils'

const props = defineProps({
  layoutIndex: {
    type: Object,
    required: true
  },
  wells: {
    type: Object,
    default: () => ({})
  },
  selection: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['well-click'])

const selectedSet = computed(() => new Set(props.selection || []))

const idLookup = computed(() => {
  const lookup = new Map()
  if (!props.layoutIndex) return lookup
  Object.entries(props.layoutIndex.positionById || {}).forEach(([id, meta]) => {
    lookup.set(`${meta.rowIndex}:${meta.columnIndex}`, id)
  })
  return lookup
})

const cellMatrix = computed(() => {
  if (!props.layoutIndex) return []
  const matrix = []
  props.layoutIndex.rowLabels.forEach((rowLabel, rowIndex) => {
    const rowCells = []
    props.layoutIndex.columnLabels.forEach((columnNumber, columnIndex) => {
      const key = `${rowIndex}:${columnIndex}`
      const fallbackId = formatWellId(rowLabel, columnNumber, props.layoutIndex.wellKeying, rowIndex)
      const wellId = idLookup.value.get(key) || fallbackId
      const wellData = props.wells?.[wellId]
      rowCells.push({
        rowLabel,
        columnNumber,
        wellId,
        inputs: Array.isArray(wellData?.inputs) ? wellData.inputs : []
      })
    })
    matrix.push(rowCells)
  })
  return matrix
})

function handleWellClick(event, wellId) {
  emit('well-click', { event, wellId })
}
</script>

<template>
  <div class="plate-grid">
    <table>
      <thead>
        <tr>
          <th />
          <th v-for="column in layoutIndex.columnLabels" :key="column">
            {{ column }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(rowLabel, rowIndex) in layoutIndex.rowLabels" :key="rowLabel">
          <th>{{ rowLabel }}</th>
          <td v-for="cell in cellMatrix[rowIndex]" :key="cell.wellId">
            <button
              type="button"
              class="well-button"
              :class="{
                'is-selected': selectedSet.has(cell.wellId),
                'has-content': cell.inputs.length
              }"
              @click="handleWellClick($event, cell.wellId)"
            >
              <span class="well-id">{{ cell.wellId }}</span>
              <span v-if="cell.inputs.length" class="well-meta">
                {{ cell.inputs.length }} inputs
              </span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.plate-grid {
  overflow: auto;
  max-height: 600px;
}

table {
  border-collapse: collapse;
  width: 100%;
  min-width: 500px;
}

th,
td {
  border: 1px solid #e2e8f0;
  text-align: center;
  padding: 0.1rem;
}

th {
  background: #f1f5f9;
  font-weight: 600;
  font-size: 0.85rem;
  position: sticky;
  top: 0;
  z-index: 1;
}

.well-button {
  width: 100%;
  height: 3rem;
  border: none;
  border-radius: 6px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: #0f172a;
}

.well-button.has-content {
  border: 1px solid #94a3b8;
}

.well-button.is-selected {
  background: #dbeafe;
  border: 2px solid #2563eb;
}

.well-id {
  font-weight: 600;
}

.well-meta {
  font-size: 0.7rem;
  color: #475569;
}
</style>
