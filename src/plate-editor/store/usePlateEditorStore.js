import { reactive } from 'vue'
import { createLayoutIndex, computeRangeSelection } from '../utils/layoutUtils'

export function usePlateEditorStore() {
  const state = reactive({
    record: null,
    spec: null,
    layoutIndex: null,
    materialLibrary: {
      entries: [],
      byId: {}
    },
    selection: {
      anchor: null,
      wells: []
    },
    history: [],
    future: []
  })

  function initialize(payload = {}) {
    state.record = payload.record || null
    state.spec = payload.spec || null
    state.layoutIndex = state.record ? createLayoutIndex(state.record.layout || {}) : null
    setMaterialLibrary(payload.materialLibrary || [])
    resetSelection()
    resetHistory()
  }

  function setMaterialLibrary(entries = []) {
    const normalized = Array.isArray(entries) ? entries : []
    state.materialLibrary.entries = normalized
    const byId = {}
    normalized.forEach((entry) => {
      if (entry?.id) {
        byId[entry.id] = entry
      }
    })
    state.materialLibrary.byId = byId
  }

  function resetSelection() {
    state.selection.anchor = null
    state.selection.wells = []
  }

  function resetHistory() {
    state.history = []
    state.future = []
  }

  function setSelection(wells = [], anchor = null) {
    const unique = Array.isArray(wells)
      ? wells.filter((well, index, array) => well && array.indexOf(well) === index)
      : []
    state.selection.wells = unique
    state.selection.anchor = anchor || unique[0] || null
  }

  function selectSingle(wellId) {
    if (!wellId) {
      resetSelection()
      return
    }
    setSelection([wellId], wellId)
  }

  function toggleSelection(wellId) {
    if (!wellId) return
    const set = new Set(state.selection.wells)
    if (set.has(wellId)) {
      set.delete(wellId)
    } else {
      set.add(wellId)
    }
    setSelection(Array.from(set), set.size ? state.selection.anchor || wellId : null)
  }

  function rangeSelect(targetId) {
    if (!targetId || !state.layoutIndex) return
    const anchor = state.selection.anchor || targetId
    const range = computeRangeSelection(anchor, targetId, state.layoutIndex)
    setSelection(range, anchor)
  }

  function pushHistory(entry) {
    if (!entry) return
    state.history = [...state.history, entry]
    state.future = []
  }

  function undo() {
    if (!state.history.length) return null
    const entry = state.history[state.history.length - 1]
    state.history = state.history.slice(0, -1)
    state.future = [entry, ...state.future]
    revertHistoryEntry(entry, 'before')
    return entry
  }

  function redo() {
    if (!state.future.length) return null
    const [entry, ...rest] = state.future
    state.future = rest
    state.history = [...state.history, entry]
    revertHistoryEntry(entry, 'after')
    return entry
  }

  function revertHistoryEntry(entry, phaseKey) {
    if (!entry || !state.record) return
    if (entry.before && entry.after && entry.before === entry.after) return
    if (entry.kind === 'material') {
      restoreWellSnapshots(entry[phaseKey] || {})
    } else if (entry.kind === 'event') {
      restoreEventsSnapshot(entry[phaseKey] || [])
    }
  }

  function restoreWellSnapshots(snapshot = {}) {
    if (!state.record) return
    if (!state.record.wells) state.record.wells = {}
    Object.entries(snapshot).forEach(([wellId, data]) => {
      if (data === null || data === undefined) {
        delete state.record.wells[wellId]
      } else {
        state.record.wells[wellId] = cloneValue(data)
      }
    })
  }

  function restoreEventsSnapshot(collection = []) {
    if (!state.record) return
    state.record.events = collection.map((entry) => cloneValue(entry))
  }

  function applyMaterialUse(payload = {}) {
    if (!state.record) return
    const { material, role, amount, notes, wells, lot, label } = payload
    const targets = Array.isArray(wells) && wells.length ? wells : [...state.selection.wells]
    if (!targets.length || !material || !role) return
    state.record.wells ||= {}
    const before = snapshotWells(targets)
    const controlIntentInfo = normalizeControlIntentPayload(payload)
    targets.forEach((wellId) => {
      const well = ensureWell(state.record.wells, wellId)
      const entryIndex = well.inputs.findIndex((entry) => entry.material?.id === material && entry.role === role)
      const normalized = {
        material: { id: material },
        role,
        amount: amount || null,
        lot: lot || null,
        notes: notes || ''
      }
      if (entryIndex >= 0) {
        const updated = {
          ...well.inputs[entryIndex],
          ...normalized
        }
        applyControlIntents(updated, controlIntentInfo)
        well.inputs[entryIndex] = updated
      } else {
        const nextEntry = {
          ...normalized
        }
        applyControlIntents(nextEntry, controlIntentInfo)
        well.inputs.push(nextEntry)
      }
    })
    const after = snapshotWells(targets)
    pushHistory({
      kind: 'material',
      action: 'apply',
      wells: [...targets],
      before,
      after
    })
    appendEvent({
      kind: 'apply_material',
      wells: [...targets],
      payload: {
        material,
        role,
        label: label || ''
      }
    })
  }

  function removeMaterialUse(payload = {}) {
    if (!state.record) return
    const { material, role, wells } = payload
    const targets = Array.isArray(wells) && wells.length ? wells : [...state.selection.wells]
    if (!targets.length || !material) return
    state.record.wells ||= {}
    const before = snapshotWells(targets)
    targets.forEach((wellId) => {
      const well = ensureWell(state.record.wells, wellId, false)
      if (!well) return
      well.inputs = well.inputs.filter((entry) => {
        if (role && entry.role !== role) return true
        return entry.material?.id !== material
      })
      if (!well.inputs.length) {
        delete state.record.wells[wellId]
      }
    })
    const after = snapshotWells(targets)
    pushHistory({
      kind: 'material',
      action: 'remove',
      wells: [...targets],
      before,
      after
    })
    appendEvent({
      kind: 'remove_material',
      wells: [...targets],
      payload: {
        material,
        role: role || null
      }
    })
  }

  function appendEvent(eventInput = {}) {
    if (!state.record) return
    const timestamp = eventInput.timestamp || new Date().toISOString()
    state.record.events ||= []
    const before = state.record.events.map((entry) => cloneValue(entry))
    const nextEntry = {
      id: eventInput.id || `evt-${Math.random().toString(36).slice(2, 9)}`,
      kind: eventInput.kind || 'event',
      wells: Array.isArray(eventInput.wells) ? [...eventInput.wells] : [],
      timestamp,
      payload: cloneValue(eventInput.payload || {})
    }
    state.record.events.push(nextEntry)
    const after = state.record.events.map((entry) => cloneValue(entry))
    pushHistory({
      kind: 'event',
      action: 'append',
      before,
      after
    })
  }

  function snapshotWells(wellIds = []) {
    const snapshot = {}
    wellIds.forEach((wellId) => {
      const well = state.record?.wells?.[wellId]
      snapshot[wellId] = well ? cloneValue(well) : null
    })
    return snapshot
  }

  function ensureWell(wellCollection, wellId, createOnMissing = true) {
    if (!wellCollection) return null
    if (!wellCollection[wellId] && createOnMissing) {
      wellCollection[wellId] = { inputs: [] }
    }
    if (!wellCollection[wellId]) return null
    if (!Array.isArray(wellCollection[wellId].inputs)) {
      wellCollection[wellId].inputs = []
    }
    return wellCollection[wellId]
  }

  function cloneValue(value) {
    if (value === null || value === undefined) return value
    return JSON.parse(JSON.stringify(value))
  }

  function getSelectionSnapshot() {
    return {
      anchor: state.selection.anchor,
      wells: [...state.selection.wells]
    }
  }

  function normalizeControlIntentPayload(payload = {}) {
    if (Array.isArray(payload.controlIntents)) {
      return {
        provided: true,
        list: normalizeControlIntents(payload.controlIntents)
      }
    }
    if (Array.isArray(payload.control_intents)) {
      return {
        provided: true,
        list: normalizeControlIntents(payload.control_intents)
      }
    }
    return { provided: false, list: [] }
  }

  function normalizeControlIntents(collection = []) {
    if (!Array.isArray(collection)) return []
    const normalized = []
    collection.forEach((entry) => {
      const feature = typeof entry?.feature === 'string' ? entry.feature.trim() : ''
      const kind = typeof entry?.kind === 'string' ? entry.kind.trim() : ''
      if (!feature || !kind) return
      const normalizedEntry = { feature, kind }
      const effect = typeof entry?.expected_effect === 'string' ? entry.expected_effect.trim() : ''
      if (effect) {
        normalizedEntry.expected_effect = effect
      }
      normalized.push(normalizedEntry)
    })
    return normalized
  }

  function applyControlIntents(target = {}, info = { provided: false, list: [] }) {
    if (!info?.provided) return
    if (info.list.length) {
      target.control_intents = info.list.map((entry) => ({ ...entry }))
    } else {
      delete target.control_intents
    }
  }

  return {
    state,
    initialize,
    setMaterialLibrary,
    setSelection,
    selectSingle,
    toggleSelection,
    rangeSelect,
    resetSelection,
    pushHistory,
    undo,
    redo,
    getSelectionSnapshot,
    applyMaterialUse,
    removeMaterialUse,
    appendEvent
  }
}
