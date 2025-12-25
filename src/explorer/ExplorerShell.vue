<script setup>
import { computed, reactive, ref, watch } from 'vue'
import PlateGrid from '../plate-editor/components/PlateGrid.vue'
import TimelineScrubber from './TimelineScrubber.vue'
import EventLanes from './EventLanes.vue'
import WellDetailsDrawer from './WellDetailsDrawer.vue'
import { plateStateAtTime, buildLineageGraph, replayPlateEvents, eventTimelineForLabware } from '../event-graph/selectors.js'
import { buildOverlay, extractWellsFromEvent } from './helpers.js'

const props = defineProps({
  events: {
    type: Array,
    default: () => []
  },
  layoutIndex: {
    type: Object,
    required: true
  },
  labwareId: {
    type: String,
    required: true
  }
})

const state = reactive({
  cursor: '',
  selection: [],
  wells: {},
  lineage: { nodes: [], edges: [] },
  selectedWell: '',
  selectedLabware: '',
  overlayMode: 'dominant',
  overlayFilter: '',
  selectedEvent: null
})

const sortedEvents = computed(() =>
  [...(props.events || [])].sort((a, b) => (Date.parse(a.timestamp || '') || 0) - (Date.parse(b.timestamp || '') || 0))
)

watch(
  () => [props.events, state.cursor, props.labwareId],
  () => {
    recompute()
  },
  { deep: true, immediate: true }
)

function recompute() {
  const plateState = plateStateAtTime(sortedEvents.value, state.cursor, {
    depletionByLabwareId: {}
  })
  const labwareState = plateState[props.labwareId] || {}
  state.wells = toLegacyWells(labwareState)
  state.lineage = buildLineageGraph(replayPlateEvents(sortedEvents.value).edges)
}

function toLegacyWells(labwareState = {}) {
  const wells = {}
  Object.entries(labwareState).forEach(([wellId, well]) => {
    wells[wellId] = {
      inputs: (well.components || []).map((comp) => ({
        material: { id: comp.materialId },
        role: 'component',
        amount: comp.moles,
        notes: comp.sourceWell ? `${comp.sourceLabware}:${comp.sourceWell}` : ''
      }))
    }
  })
  return wells
}

function handleWellClick({ wellId }) {
  state.selectedWell = wellId
  state.selectedLabware = props.labwareId
  state.selection = [wellId]
}

function handleEventSelect(evt) {
  if (!evt?.timestamp) return
  state.cursor = evt.timestamp
  state.selectedEvent = evt
  const highlighted = extractWellsFromEvent(evt)
  state.selection = highlighted.length ? highlighted : []
}

const timelineForLabware = computed(() => eventTimelineForLabware(sortedEvents.value, props.labwareId))
const currentWellState = computed(() => {
  const plateState = plateStateAtTime(sortedEvents.value, state.cursor)
  return plateState[props.labwareId]?.[state.selectedWell] || null
})

const overlayMap = computed(() => {
  const plateState = plateStateAtTime(sortedEvents.value, state.cursor)
  const labwareState = plateState[props.labwareId] || {}
  return buildOverlay(labwareState, {
    mode: state.overlayMode,
    filter: state.overlayFilter
  })
})

const mappingPreview = computed(() => {
  const evt = state.selectedEvent
  if (!evt || evt.event_type !== 'transfer') return []
  const details = evt.details || {}
  if (Array.isArray(details.mapping) && details.mapping.length) {
    return details.mapping
  }
  if (details.target?.wells && typeof details.target.wells === 'object') {
    return Object.keys(details.target.wells).map((well) => ({
      source_well: details.source?.wells?.[well]?.well || well,
      target_well: well,
      volume: details.target.wells[well].volume || details.volume || ''
    }))
  }
  return []
})

const overlayLegend = computed(() => {
  const entries = []
  Object.values(overlayMap.value || {}).forEach((entry) => {
    if (!entry?.color) return
    const key = entry.materialId || entry.label || entry.color
    if (!entries.find((e) => e.key === key)) {
      entries.push({ key, label: entry.label || 'Volume', color: entry.color, borderColor: entry.borderColor })
    }
  })
  return entries
})

const lineageForSelectedWell = computed(() => {
  if (!state.selectedWell) return { nodes: [], edges: [] }
  const edges = (state.lineage.edges || []).filter((edge) => {
    return (
      edge.to?.wellId === state.selectedWell ||
      edge.from?.wellId === state.selectedWell ||
      edge.to?.sampleId === state.selectedWell
    )
  })
  return { nodes: state.lineage.nodes || [], edges }
})
</script>

<template>
  <div class="explorer">
    <header class="explorer__header">
      <div>
        <p class="kicker">Lab Event Graph Explorer</p>
        <h2>{{ labwareId }}</h2>
        <p class="muted">Events: {{ sortedEvents.length }} · Cursor: {{ state.cursor || 'latest' }}</p>
      </div>
    </header>

    <section class="panel">
      <TimelineScrubber :events="sortedEvents" v-model:cursor="state.cursor" />
    </section>

    <div class="layout">
      <section class="panel">
        <div class="panel__header">
          <h3>Plate state at cursor</h3>
          <p class="muted">{{ state.selection.length }} selected</p>
        </div>
        <div class="toolbar">
          <label>
            Overlay
            <select v-model="state.overlayMode">
              <option value="dominant">Dominant material</option>
              <option value="volume">Total volume</option>
              <option value="material">Material filter</option>
            </select>
          </label>
          <label v-if="state.overlayMode === 'material'">
            Filter material
            <input v-model="state.overlayFilter" type="text" placeholder="material:id or label" />
          </label>
        </div>
        <PlateGrid
          :layout-index="layoutIndex"
          :wells="state.wells"
          :overlay="overlayMap"
          :selection="state.selection"
          @well-click="handleWellClick"
        />
        <div class="legend" v-if="overlayLegend.length">
          <strong>Overlay legend</strong>
          <div class="legend__items">
            <span v-for="entry in overlayLegend" :key="entry.key" class="legend__item">
              <span class="legend__swatch" :style="{ background: entry.color, borderColor: entry.borderColor }" />
              {{ entry.label }}
            </span>
          </div>
        </div>
        <div v-if="mappingPreview.length" class="mapping-preview">
          <strong>Mapping preview ({{ mappingPreview.length }})</strong>
          <ul>
            <li v-for="(m, idx) in mappingPreview" :key="idx">
              <code>{{ m.source_well }}</code> → <code>{{ m.target_well }}</code>
              <span v-if="m.volume"> ({{ m.volume }})</span>
            </li>
          </ul>
        </div>
      </section>

      <aside class="sidecar">
        <EventLanes :events="sortedEvents" @select="handleEventSelect" />
        <WellDetailsDrawer
          :open="Boolean(state.selectedWell)"
          :well-id="state.selectedWell"
          :labware-id="state.selectedLabware"
          :well-state="currentWellState"
          :lineage="lineageForSelectedWell"
          @close="state.selectedWell = ''"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.explorer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.explorer__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.kicker {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}

.muted {
  color: #94a3b8;
  margin: 0;
}

.panel {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar label {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.legend {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.legend__items {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.legend__item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
  color: #334155;
}

.legend__swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  display: inline-block;
}

.mapping-preview {
  margin-top: 0.75rem;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  background: #f8fafc;
  color: #334155;
}

.mapping-preview ul {
  margin: 0.4rem 0 0;
  padding-left: 1rem;
}

.layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1rem;
}

.sidecar {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 280px;
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
