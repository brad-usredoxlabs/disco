import { reactive } from 'vue'
import { computeRangeSelection } from '../plate-editor/utils/layoutUtils'
import { resolveLayoutIndex } from '../plate-editor/utils/layoutResolver'
import { plateStateAtTime } from '../event-graph/replay'

// Run-centric store for authoring PlateEvents inside Run activities
export function useRunEditorStore() {
  const state = reactive({
    run: null,
    materialLibrary: {
      entries: [],
      byId: {},
      byLabel: {}
    },
    layoutIndex: resolveLayoutIndex({}, { fallbackKind: 'plate96' }),
    selection: {
      anchor: null,
      wells: []
    },
    activeActivityId: null,
    activeLabwareId: '',
    cursor: '',
    derivedWellsByLabware: {},
    depletion: {},
    history: [],
    future: []
  })

  function initialize(payload = {}) {
    state.run = payload.run || null
    state.layoutIndex = resolveLayoutIndex(payload.layout || {}, { fallbackKind: 'plate96' })
    ensureRunShape()
    ensureActivityExists()
    setMaterialLibrary(payload.materialLibrary || [])
    state.activeActivityId = resolveInitialActivityId()
    state.activeLabwareId = resolveInitialLabwareId(payload?.labwareId)
    state.cursor = ''
    syncDerivedWellsFromEvents()
    resetSelection()
    resetHistory()
  }

  function resolveInitialActivityId() {
    const activities = state.run?.data?.activities
    if (Array.isArray(activities) && activities.length) {
      return activities[0].id || null
    }
    return null
  }

  function resolveInitialLabwareId(preferred = '') {
    if (preferred) return preferred
    const bindings = state.run?.data?.labware_bindings || {}
    const firstBinding = Object.values(bindings)[0]
    if (firstBinding) return firstBinding
    return resolvePrimaryLabwareRef()?.['@id'] || ''
  }

  function ensureRunShape() {
    state.run ||= {}
    state.run.data ||= {}
    if (!Array.isArray(state.run.data.activities)) {
      state.run.data.activities = []
    }
  }

  function ensureActivityExists() {
    ensureRunShape()
    if (!state.run.data.activities.length) {
      state.run.data.activities.push({
        id: generateActivityId(),
        kind: 'protocol_segment',
        label: 'Activity 1',
        plate_events: []
      })
    }
  }

  function setMaterialLibrary(entries = []) {
    const normalized = Array.isArray(entries) ? entries : []
    state.materialLibrary.entries = normalized
    const byId = {}
    const byLabel = {}
    normalized.forEach((entry) => {
      if (entry?.id) byId[entry.id] = entry
      if (entry?.label) byLabel[entry.label] = entry.id || entry.label
    })
    state.materialLibrary.byId = byId
    state.materialLibrary.byLabel = byLabel
    syncDerivedWellsFromEvents()
  }

  function setSelection(wells = [], anchor = null) {
    const unique = Array.isArray(wells)
      ? wells.filter((well, index, array) => well && array.indexOf(well) === index)
      : []
    state.selection.wells = unique
    state.selection.anchor = anchor || unique[0] || null
  }

  function resetSelection() {
    state.selection.anchor = null
    state.selection.wells = []
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

  function setActiveActivityId(activityId) {
    state.activeActivityId = activityId || null
    state.cursor = ''
    syncDerivedWellsFromEvents()
  }

  function setActiveLabwareId(labwareId) {
    state.activeLabwareId = labwareId || ''
    syncDerivedWellsFromEvents()
  }

  function addActivity(payload = {}) {
    if (!state.run) return null
    const activity = {
      id: payload.id || generateActivityId(),
      kind: payload.kind || 'protocol_segment',
      label: payload.label || payload.id || 'Untitled activity',
      plate_events: []
    }
    if (!state.run.data) state.run.data = {}
    if (!Array.isArray(state.run.data.activities)) state.run.data.activities = []
    state.run.data.activities.push(activity)
    state.activeActivityId = activity.id
    state.cursor = ''
    return activity
  }

  function getActiveActivity() {
    if (!state.run?.data?.activities || !state.activeActivityId) return null
    return state.run.data.activities.find((act) => act?.id === state.activeActivityId) || null
  }

  function pushHistory(entry) {
    if (!entry) return
    state.history = [...state.history, entry]
    state.future = []
  }

  function resetHistory() {
    state.history = []
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
    if (!entry || !entry.activityId) return
    if (entry.kind === 'event') {
      restoreEventsSnapshot(entry.activityId, entry[phaseKey] || [])
    }
  }

  function restoreEventsSnapshot(activityId, collection = []) {
    const activity = findActivity(activityId)
    if (!activity) return
    activity.plate_events = collection.map((evt) => cloneValue(evt))
    syncDerivedWellsFromEvents()
  }

  function findActivity(activityId) {
    if (!state.run?.data?.activities?.length) return null
    return state.run.data.activities.find((act) => act?.id === activityId) || null
  }

  function appendEvent(eventInput = {}) {
    const activity = getActiveActivity()
    if (!activity) return
    activity.plate_events ||= []
    const normalized = normalizeEventPayload(eventInput)
    if (!normalized) return
    const before = snapshotEvents(activity)
    activity.plate_events.push(normalized)
    const after = snapshotEvents(activity)
    // Jump cursor to latest so the grid reflects newly added events
    state.cursor = ''
    pushHistory({
      kind: 'event',
      action: 'append',
      activityId: activity.id,
      before,
      after
    })
    syncDerivedWellsFromEvents()
  }

  function snapshotEvents(activity) {
    return activity?.plate_events?.map((entry) => cloneValue(entry)) || []
  }

  function applyMaterialUse(payload = {}) {
    ensureActivityExists()
    const targets = Array.isArray(payload.wells) && payload.wells.length ? payload.wells : [...state.selection.wells]
    if (!targets.length || !payload.material || !payload.role) return
    const eventPayload = buildTransferEvent({
      material: payload.material,
      role: payload.role,
      amount: payload.amount,
      wells: targets,
      label: payload.label,
      controlIntents: payload.controlIntents,
      sourceLabware: payload.sourceLabware,
      targetLabware: payload.targetLabware
    })
    if (eventPayload) appendEvent(eventPayload)
  }

  function removeMaterialUse(payload = {}) {
    ensureActivityExists()
    const targets = Array.isArray(payload.wells) && payload.wells.length ? payload.wells : [...state.selection.wells]
    if (!targets.length || !payload.material) return
    const eventPayload = buildWashEvent({
      material: payload.material,
      role: payload.role,
      wells: targets,
      targetLabware: payload.targetLabware
    })
    if (eventPayload) appendEvent(eventPayload)
  }

  function buildTransferEvent(options = {}) {
    ensureActivityExists()
    const activity = getActiveActivity()
    if (!activity) return null
    const targetLabware = resolveLabwareRef(options.targetLabware)
    const materialId = options.material
    const volume = formatVolumeString(options.amount) || '1 uL'
    const mapping = []
    const targetWells = {}
    const sourceWells = {}
    const selected = Array.isArray(options.wells) ? options.wells : []
    const materialDetails = {
      id: materialId,
      label: resolveMaterialLabel(materialId, options.label),
      kind: options.role || 'other',
      stock_concentration: options.stockConcentration || null
    }
    
    // Use virtual/material labware for material additions (not tied to physical reservoir)
    const sourceLabware = {
      '@id': 'virtual/material',
      kind: 'virtual',
      label: 'Material Source'
    }
    
    // Use materialId as the source well ID to provide stable, unique source per material
    const sourceWellId = materialId
    
    selected.forEach((wellId) => {
      mapping.push({
        source_well: sourceWellId,
        target_well: wellId,
        volume
      })
      targetWells[wellId] = {
        well: wellId,
        role: options.role || 'other',
        material_id: materialId,
        notes: options.label || '',
        volume,
        material: materialDetails
      }
    })
    sourceWells[sourceWellId] = {
      material: materialDetails,
      role: options.role || 'material',
      volume
    }
    return {
      event_type: 'transfer',
      timestamp: new Date().toISOString(),
      run: resolveRunRef(),
      labware: [sourceLabware, targetLabware],
      details: {
        type: 'transfer',
        source: {
          labware: sourceLabware,
          wells: sourceWells
        },
        target: {
          labware: targetLabware,
          wells: targetWells
        },
        mapping,
        volume,
        material: materialDetails
      }
    }
  }

  function buildWashEvent(options = {}) {
    const activity = getActiveActivity()
    if (!activity) return null
    const targetLabware = resolveLabwareRef(options.targetLabware)
    return {
      event_type: 'wash',
      timestamp: new Date().toISOString(),
      run: resolveRunRef(),
      labware: [targetLabware],
      details: {
        type: 'wash',
        labware: targetLabware,
        wells: Array.isArray(options.wells) ? options.wells : [],
        buffer: {
          label: options.material || resolveMaterialLabel(options.material),
          kind: options.role || 'wash_buffer'
        },
        cycles: 1
      }
    }
  }

  function resolveRunRef() {
    const recordId = state.run?.metadata?.recordId || state.run?.metadata?.id || state.run?.metadata?.title
    return recordId ? `run/${recordId}` : 'run/unknown'
  }

  function resolveLabwareRef(labwareInput = null) {
    if (labwareInput && typeof labwareInput === 'object') {
      return labwareInput
    }
    const bindings =
      state.run?.data?.labware_bindings || state.run?.labware_bindings || state.run?.metadata?.labware_bindings
    if (labwareInput && typeof labwareInput === 'string') {
      const bound = bindings?.[labwareInput]
      if (bound) {
        return {
          '@id': bound,
          kind: guessLabwareKind(bound),
          label: labwareInput
        }
      }
      if (labwareInput === 'plate') {
        return resolvePrimaryLabwareRef()
      }
      return {
        '@id': labwareInput,
        kind: guessLabwareKind(labwareInput),
        label: labwareInput
      }
    }
    return resolvePrimaryLabwareRef()
  }

  function resolvePrimaryLabwareRef() {
    const recordId = state.run?.metadata?.recordId || state.run?.metadata?.id || 'unknown'
    return {
      '@id': `plate/${recordId}`,
      kind: 'plate',
      label: state.run?.metadata?.title || recordId
    }
  }

  function resolveActiveLabwareId(events = []) {
    if (state.activeLabwareId) return state.activeLabwareId
    const bindingForTarget = resolveLabwareIdForRole('target')
    if (bindingForTarget) return bindingForTarget
    const bindings = state.run?.data?.labware_bindings || {}
    const firstBinding = Object.values(bindings)[0]
    if (firstBinding) return firstBinding
    const targetIds = new Set()
    events.forEach((evt) => {
      const target = evt?.details?.target?.labware?.['@id'] || evt?.details?.target?.labware
      if (target) targetIds.add(target)
    })
    if (targetIds.size) return Array.from(targetIds)[0]
    return resolvePrimaryLabwareRef()?.['@id'] || 'plate/unknown'
  }

  function optionsDepletionDefaults() {
    const overrides = state.run?.data?.labware_depletion || {}
    return {
      plate: overrides.plate ?? true,
      reservoir: overrides.reservoir ?? false,
      tube_rack: overrides.tube_rack ?? false
    }
  }

  function availableLabwareIds(events = []) {
    const ids = new Set()
    const bindings = state.run?.data?.labware_bindings || {}
    Object.values(bindings || {}).forEach((val) => val && ids.add(val))
    events.forEach((evt) => {
      const targets = [].concat(evt?.details?.target?.labware || [])
      const sources = [].concat(evt?.details?.source?.labware || [])
      ;[...targets, ...sources].forEach((lw) => {
        if (!lw) return
        const lwId = typeof lw === 'string' ? lw : lw['@id']
        // Exclude virtual labware from UI labware selector
        if (lwId && !lwId.startsWith('virtual/')) {
          ids.add(lwId)
        }
      })
    })
    return Array.from(ids)
  }

  function resolveLabwareIdForRole(role = '') {
    if (!role) return ''
    const bindings = state.run?.data?.labware_bindings || {}
    return bindings[role] || ''
  }

  function setLabwareDepletion(labwareId, value) {
    if (!labwareId || value === undefined || value === null) return
    state.run ||= {}
    state.run.data ||= {}
    state.run.data.labware_depletion ||= {}
    state.run.data.labware_depletion[labwareId] = Boolean(value)
    syncDerivedWellsFromEvents()
  }

  function guessLabwareKind(idOrLabel = '') {
    const value = String(idOrLabel || '').toLowerCase()
    if (value.includes('res')) return 'reservoir'
    if (value.includes('tube')) return 'tube_rack'
    return 'plate'
  }

  function resolveMaterialLabel(materialId, fallback = '') {
    if (!materialId) return fallback || ''
    const entry = state.materialLibrary.byId[materialId]
    return entry?.label || fallback || materialId
  }

  function toWellInputs(plateState = {}, materialLibrary) {
    const wells = {}
    Object.entries(plateState).forEach(([wellId, wellState]) => {
      const inputs = []
      if (Array.isArray(wellState?.components)) {
        wellState.components.forEach((comp) => {
          const label = materialLibrary.byId[comp.materialId]?.label || comp.materialId
          inputs.push({
            material: {
              id: comp.materialId,
              label
            },
            role: 'component',
            notes: comp.sourceEventId || '',
            amount: comp.volumeL
              ? {
                  value: Number((comp.volumeL * 1e6).toFixed(2)),
                  unit: 'uL'
                }
              : null
          })
        })
      }
      wells[wellId] = { inputs }
    })
    return wells
  }

  function formatVolumeString(amount) {
    if (!amount) return ''
    if (typeof amount === 'string') return amount
    if (typeof amount === 'object' && amount.value !== undefined && amount.unit) {
      return `${amount.value} ${amount.unit}`
    }
    return ''
  }

  function cloneValue(value) {
    if (value === null || value === undefined) return value
    return JSON.parse(JSON.stringify(value))
  }

  function normalizeEventPayload(eventInput = {}) {
    if (eventInput.event_type && eventInput.details) {
      return {
        id: eventInput.id || generateEventId(),
        event_type: eventInput.event_type,
        timestamp: eventInput.timestamp || new Date().toISOString(),
        run: eventInput.run || resolveRunRef(),
        labware: eventInput.labware?.length ? eventInput.labware : [resolvePrimaryLabwareRef()],
        details: cloneValue(eventInput.details)
      }
    }
    return null
  }

  function generateEventId() {
    return `evt-${Math.random().toString(36).slice(2, 9)}`
  }

  function generateActivityId() {
    return `act-${Math.random().toString(36).slice(2, 7)}`
  }

  function syncDerivedWellsFromEvents() {
    const activity = getActiveActivity()
    if (!activity || !Array.isArray(activity.plate_events)) {
      state.derivedWells = {}
      return
    }
    const filteredEvents = filterEventsByCursor(activity.plate_events, state.cursor)
    const plateState = plateStateAtTime(filteredEvents, null, {
      depletionDefaults: optionsDepletionDefaults()
    })
    const byLabware = {}
    Object.entries(plateState || {}).forEach(([labwareId, wellsState]) => {
      byLabware[labwareId] = toWellInputs(wellsState || {}, state.materialLibrary)
    })
    state.derivedWellsByLabware = byLabware
    const labwareId = resolveActiveLabwareId(filteredEvents)
    state.activeLabwareId = labwareId
  }

  function filterEventsByCursor(events = [], cursor = '') {
    if (!cursor) return events
    const cursorTs = Date.parse(cursor)
    if (!Number.isFinite(cursorTs)) return events
    return events.filter((evt) => {
      const ts = Date.parse(evt?.timestamp || '')
      if (!Number.isFinite(ts)) return true
      return ts <= cursorTs
    })
  }

  function setCursor(timestamp) {
    state.cursor = timestamp || ''
    syncDerivedWellsFromEvents()
  }

  function getSelectionSnapshot() {
    return {
      anchor: state.selection.anchor,
      wells: [...state.selection.wells]
    }
  }

  function getDerivedWells(labwareId) {
    if (!labwareId) return state.derivedWellsByLabware[state.activeLabwareId] || {}
    return state.derivedWellsByLabware[labwareId] || {}
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
    setActiveActivityId,
    setActiveLabwareId,
    applyMaterialUse,
    removeMaterialUse,
    appendEvent,
    undo,
    redo,
    getSelectionSnapshot,
    setCursor,
    availableLabwareIds,
    resolveLabwareIdForRole,
    setLabwareDepletion,
    addActivity,
    resolveLabwareRef,
    resolveRunRef,
    getDerivedWells
  }
}
