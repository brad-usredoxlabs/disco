import { reactive } from 'vue'
import { computeRangeSelection } from '../utils/layoutUtils'
import { resolveLayoutIndex } from '../utils/layoutResolver'
import { deriveWellsFromEvents } from '../utils/plateEventDeriver'

export function usePlateEditorStore() {
  const state = reactive({
    record: null,
    spec: null,
    layoutIndex: null,
    materialLibrary: {
      entries: [],
      byId: {},
      byLabel: {}
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
    state.layoutIndex = state.record ? resolveLayoutIndex(state.record.layout || {}) : null
    setMaterialLibrary(payload.materialLibrary || [])
    syncDerivedWellsFromEvents()
    resetSelection()
    resetHistory()
  }

  function setMaterialLibrary(entries = []) {
    const normalized = Array.isArray(entries) ? entries : []
    state.materialLibrary.entries = normalized
    const byId = {}
    const byLabel = {}
    normalized.forEach((entry) => {
      if (entry?.id) {
        byId[entry.id] = entry
      }
      if (entry?.label) {
        byLabel[entry.label] = entry.id || entry.label
      }
    })
    state.materialLibrary.byId = byId
    state.materialLibrary.byLabel = byLabel
    syncDerivedWellsFromEvents()
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
    syncDerivedWellsFromEvents()
  }

  function applyMaterialUse(payload = {}) {
    if (!state.record) return
    const { material, materialRevision, role, amount, wells, label, controlIntents, labware } = payload
    const targets = Array.isArray(wells) && wells.length ? wells : [...state.selection.wells]
    if (!targets.length || !material || !role) return
    const revisionMeta = resolveMaterialRevision(material, materialRevision)
    const eventPayload = buildTransferEvent({
      material,
      materialRevision: revisionMeta?.id || '',
      materialRevisionStatus: revisionMeta?.status || '',
      role,
      amount,
      wells: targets,
      label,
      labwareRef: labware,
      controlIntents
    })
    if (eventPayload) {
      appendEvent(eventPayload)
    }
  }

  function removeMaterialUse(payload = {}) {
    if (!state.record) return
    const { material, role, wells, labware } = payload
    const targets = Array.isArray(wells) && wells.length ? wells : [...state.selection.wells]
    if (!targets.length || !material) return
    const eventPayload = buildWashEvent({
      material,
      role,
      wells: targets,
      labwareRef: labware
    })
    if (eventPayload) {
      appendEvent(eventPayload)
    }
  }

  function appendEvent(eventInput = {}) {
    if (!state.record) return
    state.record.events ||= []
    const normalized = normalizeEventPayload(eventInput, state.record)
    if (!normalized) return
    const before = snapshotEvents()
    state.record.events.push(normalized)
    const after = snapshotEvents()
    pushHistory({
      kind: 'event',
      action: 'append',
      before,
      after
    })
    syncDerivedWellsFromEvents()
  }

  function snapshotEvents() {
    return state.record?.events?.map((entry) => cloneValue(entry)) || []
  }

  function cloneValue(value) {
    if (value === null || value === undefined) return value
    return JSON.parse(JSON.stringify(value))
  }

  function normalizeEventPayload(eventInput = {}, record = null) {
    if (eventInput.event_type && eventInput.details) {
      return {
        id: eventInput.id || generateEventId(),
        event_type: eventInput.event_type,
        timestamp: eventInput.timestamp || new Date().toISOString(),
        run: eventInput.run || record?.metadata?.runId || '',
        labware: eventInput.labware?.length ? eventInput.labware : [resolvePrimaryLabwareRef(record)],
        details: cloneValue(eventInput.details)
      }
    }
    // Legacy fallback (pre-PlateEvent data)
    return {
      id: eventInput.id || generateEventId(),
      kind: eventInput.kind || 'event',
      timestamp: eventInput.timestamp || new Date().toISOString(),
      wells: Array.isArray(eventInput.wells) ? [...eventInput.wells] : [],
      payload: cloneValue(eventInput.payload || {}),
      labware: eventInput.labware?.length ? eventInput.labware : [resolvePrimaryLabwareRef(record)]
    }
  }

  function hasStructuredEvents(events) {
    return Array.isArray(events) && events.some((entry) => entry && entry.event_type)
  }

  function syncDerivedWellsFromEvents() {
    if (!state.record) return
    if (!hasStructuredEvents(state.record.events)) {
      return
    }
    const derived = deriveWellsFromEvents(state.record.events || [], {
      materialsByLabel: state.materialLibrary.byLabel,
      materialsById: state.materialLibrary.byId
    })
    state.record.wells = derived
  }

  function buildTransferEvent(options = {}) {
    if (!state.record) return null
    const labwareRef = options.labwareRef || resolvePrimaryLabwareRef(state.record)
    const materialId = options.material
    const materialRevision = options.materialRevision || ''
    const materialRevisionStatus = options.materialRevisionStatus || ''
    const role = options.role
    const selectedWells = Array.isArray(options.wells) ? options.wells : []
    const volume = formatVolumeString(options.amount)
    const sourceWells = {}
    selectedWells.forEach((wellId) => {
      sourceWells[wellId] = {
        material: {
          label: resolveMaterialLabel(materialId, options.label),
          kind: role || 'other'
        },
        role,
        volume
      }
    })
    const targetWells = {}
    selectedWells.forEach((wellId) => {
      targetWells[wellId] = {
        well: wellId,
        role,
        material_id: materialId,
        ...(materialRevision
          ? {
              material_revision: materialRevision,
              material_revision_status: materialRevisionStatus
            }
          : {}),
        notes: options.label || '',
        volume
      }
    })
    return {
      event_type: 'transfer',
      timestamp: new Date().toISOString(),
      run: state.record.metadata?.runId || '',
      labware: [labwareRef],
      details: {
        type: 'transfer',
        source: {
          labware: {
            '@id': `material/${materialId}`,
            kind: 'reservoir',
            label: resolveMaterialLabel(materialId, options.label)
          },
          wells: sourceWells
        },
        target: {
          labware: labwareRef,
          wells: targetWells
        },
        volume,
        material: {
          label: resolveMaterialLabel(materialId, options.label),
          kind: role || 'other'
        },
        ...(materialRevision
          ? {
              material_revision: materialRevision,
              material_revision_label: materialRevision,
              material_revision_status: materialRevisionStatus || 'active'
            }
          : {}),
        pipetting_hint: null
      }
    }
  }

  function buildWashEvent(options = {}) {
    if (!state.record) return null
    const labwareRef = options.labwareRef || resolvePrimaryLabwareRef(state.record)
    return {
      event_type: 'wash',
      timestamp: new Date().toISOString(),
      run: state.record.metadata?.runId || '',
      labware: [labwareRef],
      details: {
        type: 'wash',
        labware: labwareRef,
        wells: Array.isArray(options.wells) ? options.wells : [],
        buffer: {
          label: options.material || resolveMaterialLabel(options.material),
          kind: options.role || 'wash_buffer'
        },
        cycles: 1
      }
    }
  }

  function resolvePrimaryLabwareRef(record = null) {
    if (!record) {
      return {
        '@id': 'plate/unknown',
        kind: 'plate',
        label: 'Plate layout'
      }
    }
    const recordId = record.metadata?.recordId || record.metadata?.id || 'unknown'
    return {
      '@id': `plate/${recordId}`,
      kind: 'plate',
      label: record.metadata?.title || recordId
    }
  }

  function resolveMaterialLabel(materialId, fallback = '') {
    if (!materialId) return fallback || ''
    const entry = state.materialLibrary.byId[materialId]
    return entry?.label || fallback || materialId
  }

  function resolveMaterialRevision(materialId, overrideId = '') {
    const entry = state.materialLibrary.byId[materialId]
    const revisionId = overrideId || entry?.material_revision || entry?.latest_revision_id || ''
    if (!revisionId) return null
    return {
      id: revisionId,
      status: entry?.latest_revision_status || 'active'
    }
  }

  function formatVolumeString(amount) {
    if (!amount) return ''
    if (typeof amount === 'string') return amount
    if (typeof amount === 'object' && amount.value !== undefined && amount.unit) {
      return `${amount.value} ${amount.unit}`
    }
    return ''
  }

  function generateEventId() {
    return `evt-${Math.random().toString(36).slice(2, 9)}`
  }

  function getSelectionSnapshot() {
    return {
      anchor: state.selection.anchor,
      wells: [...state.selection.wells]
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
