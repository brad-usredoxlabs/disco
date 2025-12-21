<script setup>
import { computed, reactive, watch } from 'vue'

const props = defineProps({
  focusSide: {
    type: String,
    default: 'target'
  },
  sourceSelection: {
    type: [Array, Object],
    default: () => []
  },
  targetSelection: {
    type: [Array, Object],
    default: () => []
  },
  sourceRole: {
    type: String,
    default: 'source_plate'
  },
  targetRole: {
    type: String,
    default: 'target_plate'
  },
  parameterNames: {
    type: Array,
    default: () => []
  },
  sourceRoleOptions: {
    type: Array,
    default: () => []
  },
  targetRoleOptions: {
    type: Array,
    default: () => []
  },
  sourceRole: {
    type: String,
    default: 'source_plate'
  },
  targetRole: {
    type: String,
    default: 'target_plate'
  }
})

const emit = defineEmits([
  'update:focusSide',
  'update:sourceSelection',
  'update:targetSelection',
  'update:sourceRole',
  'update:targetRole',
  'create-step'
])

const state = reactive({
  open: true,
  label: 'Transfer',
  notes: '',
  mappingMode: 'fill', // fill | identity | broadcast
  volumeMode: 'literal', // literal | parameter
  volumeLiteral: '5 uL',
  volumeParam: props.parameterNames?.[0] || ''
})

watch(
  () => props.parameterNames,
  (params) => {
    if (!state.volumeParam && Array.isArray(params) && params.length) {
      state.volumeParam = params[0]
    }
  },
  { immediate: true }
)

const sourceCount = computed(() => normalizeSelection(props.sourceSelection).length)
const targetCount = computed(() => normalizeSelection(props.targetSelection).length)

const mappingPreview = computed(() => {
  const src = sorted(normalizeSelection(props.sourceSelection))
  const dst = sorted(normalizeSelection(props.targetSelection))
  if (!src.length || !dst.length) return []

  if (state.mappingMode === 'broadcast') {
    const s0 = src[0]
    return dst.slice(0, 20).map((t) => ({ source_well: s0, target_well: t }))
  }
  if (state.mappingMode === 'identity') {
    if (src.length !== dst.length) return []
    return src.slice(0, 20).map((s, i) => ({ source_well: s, target_well: dst[i] }))
  }
  const n = Math.min(src.length, dst.length)
  return src.slice(0, Math.min(n, 20)).map((s, i) => ({ source_well: s, target_well: dst[i] }))
})

const canCreate = computed(() => {
  if (!sourceCount.value || !targetCount.value) return false
  if (state.volumeMode === 'parameter' && !state.volumeParam) return false
  if (state.mappingMode === 'identity') return sourceCount.value === targetCount.value
  return true
})

function wellSortKey(wellId = '') {
  const m = String(wellId).match(/^([A-Za-z]+)\s*0*([0-9]+)$/)
  if (!m) return `ZZZ-${wellId}`
  const row = m[1].toUpperCase()
  const col = parseInt(m[2], 10)
  return `${row}-${String(col).padStart(3, '0')}`
}

function sorted(list = []) {
  if (!Array.isArray(list)) return []
  return [...list].sort((a, b) => wellSortKey(a).localeCompare(wellSortKey(b)))
}

function normalizeSelection(input) {
  if (Array.isArray(input)) return input
  if (input && Array.isArray(input.value)) return input.value
  return []
}

function volumeValue() {
  if (state.volumeMode === 'parameter') return `\${${state.volumeParam}}`
  return state.volumeLiteral?.trim() || ''
}

function focus(side) {
  const next = side === 'source' ? 'source' : 'target'
  emit('update:focusSide', next)
}

function setSourceRole(role) {
  emit('update:sourceRole', role)
}

function setTargetRole(role) {
  emit('update:targetRole', role)
}

function clear(side) {
  if (side === 'source') {
    emit('update:sourceSelection', [])
  } else {
    emit('update:targetSelection', [])
  }
}

function createStep() {
  if (!canCreate.value) return
  const src = sorted(props.sourceSelection)
  const dst = sorted(props.targetSelection)

  let mapping = []
  if (state.mappingMode === 'broadcast') {
    const s0 = src[0]
    mapping = dst.map((t) => ({ source_well: s0, target_well: t }))
  } else if (state.mappingMode === 'identity') {
    mapping = src.map((s, i) => ({ source_well: s, target_well: dst[i] }))
  } else {
    const n = Math.min(src.length, dst.length)
    mapping = Array.from({ length: n }).map((_, i) => ({ source_well: src[i], target_well: dst[i] }))
  }

  const step = {
    event_type: 'transfer',
    label: state.label || 'Transfer',
    notes: state.notes || '',
    details: {
      type: 'transfer',
      source_role: props.sourceRole,
      target_role: props.targetRole,
      mapping,
      volume: volumeValue()
    }
  }

  emit('create-step', step)
}
</script>

<template>
  <aside class="sidecar" :class="{ 'sidecar--closed': !state.open }">
    <header class="sidecar__header">
      <div>
        <h3>Transfer step</h3>
        <p class="subtitle">{{ sourceRole }} → {{ targetRole }}</p>
      </div>
      <button class="ghost" type="button" @click="state.open = !state.open">
        {{ state.open ? 'Hide' : 'Show' }}
      </button>
    </header>

    <div v-if="state.open" class="sidecar__body">
      <div class="row">
        <label>Step label</label>
        <input v-model="state.label" type="text" placeholder="e.g. Add insulin" />
      </div>

      <div class="grid2">
        <div class="row">
          <label>Source role</label>
          <select :value="sourceRole" @change="setSourceRole($event.target.value)">
            <option v-if="!sourceRoleOptions.length" disabled value="">No roles defined</option>
            <option v-for="role in sourceRoleOptions" :key="role" :value="role">{{ role }}</option>
          </select>
        </div>
        <div class="row">
          <label>Target role</label>
          <select :value="targetRole" @change="setTargetRole($event.target.value)">
            <option v-if="!targetRoleOptions.length" disabled value="">No roles defined</option>
            <option v-for="role in targetRoleOptions" :key="role" :value="role">{{ role }}</option>
          </select>
        </div>
      </div>

      <div class="grid2">
        <div class="row">
          <label>Focus selection</label>
          <div class="segmented">
            <button type="button" :class="{ active: focusSide === 'source' }" @click="focus('source')">
              Source
            </button>
            <button type="button" :class="{ active: focusSide === 'target' }" @click="focus('target')">
              Target
            </button>
          </div>
          <p class="hint">Clicks update the focused selection.</p>
        </div>

        <div class="row">
          <label>Mapping mode</label>
          <select v-model="state.mappingMode">
            <option value="fill">Fill (source[i] → target[i])</option>
            <option value="identity">Identity (requires same count)</option>
            <option value="broadcast">Broadcast (source[0] → all targets)</option>
          </select>
        </div>
      </div>

      <div class="grid2">
        <div class="row">
          <label>Volume</label>
          <div class="volumeRow">
            <select v-model="state.volumeMode">
              <option value="literal">Literal</option>
              <option value="parameter">Parameter</option>
            </select>

            <input
              v-if="state.volumeMode === 'literal'"
              v-model="state.volumeLiteral"
              type="text"
              placeholder="e.g. 5 uL"
            />

            <select v-else v-model="state.volumeParam">
              <option value="" disabled>Select parameter…</option>
              <option v-for="p in parameterNames" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
        </div>

        <div class="row">
          <label>Selections</label>
          <div class="chips">
            <span class="chip">Source: {{ sourceCount }}</span>
            <span class="chip">Target: {{ targetCount }}</span>
          </div>
          <div class="chipActions">
            <button class="ghost" type="button" @click="clear('source')">Clear source</button>
            <button class="ghost" type="button" @click="clear('target')">Clear target</button>
          </div>
        </div>
      </div>

      <div class="row">
        <label>Notes</label>
        <textarea v-model="state.notes" rows="2" placeholder="Optional notes…" />
      </div>

      <div class="preview">
        <div class="preview__header">
          <strong>Mapping preview</strong>
          <span class="hint" v-if="mappingPreview.length">first {{ Math.min(mappingPreview.length, 20) }}</span>
        </div>
        <div v-if="!mappingPreview.length" class="empty">
          Select source + target wells to preview.
        </div>
        <ul v-else class="pairs">
          <li v-for="(m, i) in mappingPreview" :key="i">
            <code>{{ m.source_well }}</code> → <code>{{ m.target_well }}</code>
          </li>
        </ul>
      </div>

      <button class="primary" type="button" :disabled="!canCreate" @click="createStep">
        Add transfer step
      </button>

      <p v-if="state.mappingMode === 'identity' && sourceCount !== targetCount" class="warn">
        Identity mode requires equal source/target counts.
      </p>
    </div>
  </aside>
</template>

<style scoped>
.sidecar {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.9rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 320px;
}
.sidecar--closed .sidecar__body {
  display: none;
}

.sidecar__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}
.subtitle {
  margin: 0.15rem 0 0;
  color: #64748b;
  font-size: 0.85rem;
}

.row label {
  display: block;
  font-size: 0.85rem;
  font-weight: 700;
  color: #334155;
  margin-bottom: 0.25rem;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.45rem 0.55rem;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.volumeRow {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.5rem;
}

.segmented {
  display: inline-flex;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  overflow: hidden;
}
.segmented button {
  padding: 0.35rem 0.7rem;
  border: none;
  background: #fff;
  cursor: pointer;
}
.segmented button.active {
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 800;
}

.chips {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.chip {
  background: #e0f2fe;
  color: #0369a1;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-weight: 800;
  font-size: 0.8rem;
}
.chipActions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.35rem;
}

.preview {
  border: 1px dashed #93c5fd;
  border-radius: 12px;
  padding: 0.7rem;
  background: #f8fafc;
}
.preview__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.pairs {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.25rem;
}
.empty {
  color: #94a3b8;
  font-style: italic;
  margin-top: 0.4rem;
}

.primary {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost {
  border: 1px solid #cbd5e1;
  background: transparent;
  border-radius: 10px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}

.hint {
  margin: 0.25rem 0 0;
  color: #64748b;
  font-size: 0.8rem;
}
.warn {
  margin: 0.5rem 0 0;
  color: #b45309;
  font-size: 0.85rem;
  font-weight: 700;
}

@media (max-width: 1100px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
</style>
