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
  overlay: {
    type: Object,
    default: () => ({})
  },
  selection: {
    type: [Array, Object],
    default: () => []
  }
})

const emit = defineEmits(['well-click'])

const selectedSet = computed(() => new Set(normalizeSelection(props.selection)))

const isReservoir = computed(() => {
  return props.layoutIndex?.kind?.includes('reservoir')
})

const is384Well = computed(() => {
  const rows = props.layoutIndex?.rowLabels?.length || 0
  const cols = props.layoutIndex?.columnLabels?.length || 0
  return rows >= 16 && cols >= 24
})

const is12WellReservoir = computed(() => {
  const rows = props.layoutIndex?.rowLabels?.length || 0
  const cols = props.layoutIndex?.columnLabels?.length || 0
  return isReservoir.value && rows * cols === 12
})

const isSingleWellReservoir = computed(() => {
  const rows = props.layoutIndex?.rowLabels?.length || 0
  const cols = props.layoutIndex?.columnLabels?.length || 0
  return isReservoir.value && rows * cols === 1
})

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

function tooltipText(cell = {}) {
  if (!Array.isArray(cell.inputs) || !cell.inputs.length) {
    return `${cell.wellId || 'Well'}: empty`
  }
  const lines = cell.inputs.map((input, idx) => {
    const label = input?.material?.label || input?.material?.id || 'Material'
    const role = input?.role ? ` (${input.role})` : ''
    const amount =
      input?.amount && input.amount.value !== undefined && input.amount.unit
        ? ` · ${input.amount.value} ${input.amount.unit}`
        : ''
    const concentration =
      input?.material?.stock_concentration && input.material.stock_concentration.value !== undefined
        ? ` · ${input.material.stock_concentration.value} ${input.material.stock_concentration.unit || ''}`
        : ''
    const notes = input?.notes ? ` — ${input.notes}` : ''
    return `${idx + 1}. ${label}${role}${amount}${concentration}${notes}`
  })
  return `${cell.wellId}: ${lines.join('\n')}`
}

function normalizeSelection(selectionInput) {
  if (Array.isArray(selectionInput)) return selectionInput
  if (selectionInput && Array.isArray(selectionInput.value)) return selectionInput.value
  return []
}

function overlayStyle(wellId) {
  const entry = props.overlay?.[wellId]
  if (!entry || !entry.color) return null
  return {
    background: entry.color,
    borderColor: entry.borderColor || entry.color
  }
}
</script>

<template>
  <div class="plate-grid" :class="{ 
    'is-reservoir': isReservoir, 
    'is-384': is384Well,
    'is-12-well-reservoir': is12WellReservoir,
    'is-single-well-reservoir': isSingleWellReservoir
  }">
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
              :style="overlayStyle(cell.wellId)"
              :title="tooltipText(cell)"
              @click="handleWellClick($event, cell.wellId)"
            >
              <span class="well-id">{{ cell.wellId }}</span>
              <span v-if="cell.inputs.length" class="well-meta">
                {{ cell.inputs.length }} inputs
              </span>
              <span v-if="overlay?.[cell.wellId]?.label" class="well-overlay-label">
                {{ overlay[cell.wellId].label }}
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

.plate-grid.is-reservoir:not(.is-12-well-reservoir):not(.is-single-well-reservoir) table {
  width: auto;
  min-width: unset;
  max-width: 200px;
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

.well-overlay-label {
  font-size: 0.7rem;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.8);
  padding: 0.1rem 0.3rem;
  border-radius: 6px;
}

/* Responsive scaling for 384-well plates */
.plate-grid.is-384 table {
  min-width: 500px;
}

.plate-grid.is-384 th,
.plate-grid.is-384 td {
  padding: 0.05rem;
}

.plate-grid.is-384 th {
  font-size: 0.65rem;
}

.plate-grid.is-384 .well-button {
  height: 1.5rem;
  font-size: 0.6rem;
  gap: 0.1rem;
  border-radius: 3px;
}

.plate-grid.is-384 .well-id {
  font-size: 0.55rem;
}

.plate-grid.is-384 .well-meta {
  font-size: 0.5rem;
}

.plate-grid.is-384 .well-overlay-label {
  font-size: 0.5rem;
  padding: 0.05rem 0.2rem;
  border-radius: 3px;
}

/* Compact styling for 12-well reservoirs (portrait) */
.plate-grid.is-12-well-reservoir table {
  width: auto;
  min-width: unset;
  max-width: 200px;
}

.plate-grid.is-12-well-reservoir .well-button {
  height: 2.75rem;
  min-width: 36px;
}

.plate-grid.is-12-well-reservoir th,
.plate-grid.is-12-well-reservoir td {
  padding: 0.08rem;
}

/* Single-well reservoir - compact portrait */
.plate-grid.is-single-well-reservoir table {
  width: auto;
  min-width: unset;
  max-width: 220px;
}

.plate-grid.is-single-well-reservoir td {
  border-left: none;
  border-right: none;
}

.plate-grid.is-single-well-reservoir .well-button {
  height: 3.5rem;
  min-width: 180px;
  border-radius: 8px;
}

.plate-grid.is-single-well-reservoir th:first-child {
  border-right: 1px solid #e2e8f0;
}

.plate-grid.is-single-well-reservoir thead th:not(:first-child) {
  display: none;
}
</style>
