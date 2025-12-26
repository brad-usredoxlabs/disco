import { reactive } from 'vue'
import { computeRangeSelection } from '../plate-editor/utils/layoutUtils'
import { resolveLayoutIndex } from '../plate-editor/utils/layoutResolver'
import { plateStateAtTime } from '../event-graph/replay'
import { templateLayoutForKind, LABWARE_TEMPLATES } from './labwareTemplates'

const warned = new Set()
function warnOnce(key, message) {
  if (!key || warned.has(key)) return
  warned.add(key)
  // eslint-disable-next-line no-console
  console.warn(message)
}

function normalizeLayoutRef(layoutRef = '', kind = '') {
  const ref = layoutRef || kind || ''
  if (!ref) return ''
  const str = String(ref)
  if (str.startsWith('template:')) return str
  return `template:${str}`
}

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
    destinationPlate: {
      id: '',
      label: '',
      layoutIndex: {}
    },
    selectedDestinationId: '',
    sourcePalette: [],
    activeSourceId: '',
    cursor: '',
    nowTime: '',
    derivedWellsByLabware: {},
    derivedWellsNowByLabware: {},
    runDerivedWells: {},
    runDerivedStatus: {},
    depletion: {},
    history: [],
    future: [],
    syncSourceToCursor: false,
    runLoader: null
  })

  function initialize(payload = {}) {
    state.run = payload.run || null
    state.layoutIndex = resolveLayoutIndex(payload.layout || {}, { fallbackKind: 'plate96' })
    state.runLoader = payload.runLoader || payload.loadRunById || null
    state.runDerivedWells = {}
    state.runDerivedStatus = {}
    state.sourcePalette = []
    state.activeSourceId = ''
    seedDestinationPlate()
    ensureDestinationInstance()
    ensureLabwareInstances()
    ensureRunShape()
    seedPaletteFromData()
    seedPaletteFromBindings()
    ensureActivityExists()
    setMaterialLibrary(payload.materialLibrary || [])
    state.activeActivityId = resolveInitialActivityId()
    state.activeLabwareId = resolveInitialLabwareId(payload?.labwareId)
    updateNowTime(getActiveActivity()?.plate_events || [])
    setCursorToNow()
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
    ensureLabwareInstances()
    pruneLegacyOperations()
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

  function ensureLabwareInstances() {
    state.run ||= {}
    state.run.data ||= {}
    if (!Array.isArray(state.run.data.labware_instances)) {
      state.run.data.labware_instances = []
    }
  }

  function seedPaletteFromBindings() {
    const bindings = state.run?.data?.labware_bindings || {}
    const entries = Object.entries(bindings || {}).filter(([, id]) => id)
    if (!entries.length) return
    entries.forEach(([role, labwareId], idx) => {
      const kind = guessLabwareKind(labwareId)
      const layoutRef = normalizeLayoutRef(kind === 'plate' ? 'plate96' : 'reservoir-12', kind)
      upsertLabwareInstance({
        '@id': labwareId,
        kind,
        label: role || labwareId,
        layoutRef
      })
      upsertPaletteEntry({
        labwareId,
        type: 'template',
        label: role || labwareId,
        kind,
        layoutRef,
        layoutIndex: templateLayoutForKind(layoutRef),
        roleHint: role || ''
      })
      if (idx === 0 && !state.activeSourceId) {
        state.activeSourceId = labwareId
      }
    })
  }

  function seedPaletteFromData() {
    const palette = state.run?.data?.source_palette
    if (!Array.isArray(palette) || !palette.length) return
    palette.forEach((entry) => {
      const labwareId = entry.labwareId || entry.labware_id || entry.id
      if (!labwareId) return
      const kind = entry.kind || resolveLabwareKind(labwareId)
      const layoutRef = normalizeLayoutRef(entry.layoutRef || entry.layout_ref, kind)
      const layoutIndex =
        entry.layoutIndex ||
        resolvePaletteLayoutIndex({
          labwareId,
          kind,
          layoutRef
        })
      upsertLabwareInstance({
        '@id': labwareId,
        kind,
        label: entry.label || labwareId,
        depletion_mode: entry.depletion_mode || entry.depletionMode || 'non_depleting',
        ...(layoutRef ? { layoutRef } : {})
      })
      const normalized = upsertPaletteEntry({
        id: entry.id || labwareId,
        labwareId,
        type: entry.type || 'template',
        label: entry.label || labwareId,
        kind,
        layoutRef,
        layoutIndex: layoutIndex || templateLayoutForKind(kind === 'plate' ? 'plate96' : 'reservoir-12'),
        runId: entry.runId || entry.run_id || null,
        archived: Boolean(entry.archived),
        roleHint: entry.roleHint || entry.role_hint || entry.role || ''
      })
      if (normalized?.type === 'run-derived') {
        loadRunDerivedEntry(normalized)
      }
      if (!state.activeSourceId && !entry.archived) {
        state.activeSourceId = labwareId
      }
    })
  }

  function deriveLabwareBindings() {
    const bindings = {}
    if (state.destinationPlate?.id) {
      bindings.plate = state.destinationPlate.id
    }
    const seen = new Set(Object.keys(bindings))
    state.sourcePalette
      .filter((entry) => entry && !entry.archived)
      .forEach((entry) => {
        const key = uniqueKey(entry.roleHint || entry.label || entry.labwareId || 'source', seen)
        if (entry.labwareId) bindings[key] = entry.labwareId
      })
    state.run ||= {}
    state.run.data ||= {}
    state.run.data.labware_bindings = bindings
    return bindings
  }

  function derivePaletteData() {
    const palette = state.sourcePalette
      .filter((entry) => entry && entry.labwareId)
      .map((entry) => {
        const layoutRef = normalizeLayoutRef(entry.layout_ref || entry.layoutRef, entry.kind)
        const payload = {
          labwareId: entry.labwareId,
          label: entry.label || entry.labwareId,
          archived: Boolean(entry.archived),
          roleHint: entry.roleHint || entry.role || ''
        }
        if (layoutRef) payload.layoutRef = layoutRef
        return payload
      })
    state.run ||= {}
    state.run.data ||= {}
    state.run.data.source_palette = palette
    pruneLegacyOperations()
    return palette
  }

  function uniqueKey(base, seen) {
    const normalized = String(base || 'source')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'source'
    let candidate = normalized
    let i = 1
    while (seen.has(candidate)) {
      candidate = `${normalized}_${i}`
      i += 1
    }
    seen.add(candidate)
    return candidate
  }

  function seedDestinationPlate() {
    const primary = resolvePrimaryLabwareRef()
    state.destinationPlate = {
      id: primary?.['@id'] || '',
      label: primary?.label || '',
      kind: primary?.kind || 'plate',
      layoutIndex: state.layoutIndex || {}
    }
  }

  function ensureDestinationInstance() {
    const destId = state.destinationPlate?.id
    if (!destId) return
    const existing = state.run?.data?.labware_instances?.find((inst) => inst?.['@id'] === destId)
    const kind = state.destinationPlate?.kind || state.layoutIndex?.kind || 'plate'
    const label = state.destinationPlate?.label || destId
    const layoutRef = normalizeLayoutRef(state.destinationPlate?.layoutRef || state.destinationPlate?.layout_ref, kind)
    const depletion_mode = state.destinationPlate?.depletion_mode || 'depleting'
    if (existing) {
      upsertLabwareInstance({
        ...existing,
        kind,
        label,
        layoutRef,
        depletion_mode
      })
      return
    }
    upsertLabwareInstance({
      '@id': destId,
      kind,
      label,
      layoutRef,
      depletion_mode
    })
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

  function buildValidationPayload() {
    const run = state.run || {}
    const meta = run.metadata || {}
    const data = run.data || {}
    return {
      '@id': run['@id'] || meta.recordId || meta.id || '',
      kind: run.kind || 'run',
      label: meta.title || meta.label || '',
      project: meta.project || data.project || '',
      experiment: meta.experiment || data.experiment || '',
      labware_bindings: data.labware_bindings || {},
      labware_instances: data.labware_instances || [],
      source_palette: data.source_palette || [],
      parameters: data.parameters || {},
      activities: data.activities || []
    }
  }

  function sanitizeTransfers() {
    const activities = state.run?.data?.activities
    if (!Array.isArray(activities)) return
    activities.forEach((act) => {
      if (!Array.isArray(act?.plate_events)) return
      act.plate_events = act.plate_events.map((evt) => sanitizeTransferEvent(evt)).filter(Boolean)
    })
  }

  function sanitizeTransferEvent(event = {}) {
    if (!event || event.event_type !== 'transfer') return event
    const next = cloneValue(event)
    const details = next.details || {}
    // Normalize labware refs to ids
    const sourceId = details.source_labware || details.source?.labware?.['@id'] || details.source?.labware
    const targetId = details.target_labware || details.target?.labware?.['@id'] || details.target?.labware
    details.source_labware = sourceId || ''
    details.target_labware = targetId || ''
    if (details.source || details.target) {
      warnOnce('legacy-transfer-shape', 'Legacy transfer shape detected; normalizing to id-only labware + mapping.')
    }

    const mapping = Array.isArray(details.mapping)
      ? details.mapping
      : buildMappingFromWells(details.source?.wells, details.target?.wells, details.volume)
    const normalizedMapping = mapping
      .filter((entry) => entry && (entry.source_well || entry.target_well))
      .map((entry) => ({
        ...entry,
        source_well: normalizeWellIdString(entry?.source_well),
        target_well: normalizeWellIdString(entry?.target_well),
        volume: normalizeVolume(entry?.volume)
      }))

    const simplified = simplifyVolumePlacement(normalizedMapping, normalizeVolume(details.volume))
    const mappingSpec = resolveMappingSpec(details.mapping_spec, simplified.mapping)
    details.mapping = simplified.mapping
    details.volume = simplified.volume
    if (mappingSpec) {
      details.mapping_spec = mappingSpec
    } else {
      delete details.mapping_spec
    }
    if (details.material_id === null || details.material_id === undefined || details.material_id === '') {
      delete details.material_id
    }
    delete details.source
    delete details.target
    next.details = details
    if (!next.timestamp && !next.timestamp_actual && !next.t_offset) {
      if (isPlannedRun()) {
        next.t_offset = 'PT0S'
      } else {
        next.timestamp_actual = new Date().toISOString()
      }
    }
    return next
  }

  function buildMappingFromWells(sourceWells = {}, targetWells = {}, volume = null) {
    const mapping = []
    const normalizedVolume = normalizeVolume(volume)
    Object.keys(targetWells || {}).forEach((targetWell) => {
      mapping.push({
        source_well: Object.keys(sourceWells || {})[0] || '',
        target_well: normalizeWellIdString(targetWell),
        volume: normalizedVolume
      })
    })
    return mapping
  }

  function resolveMappingSpec(specInput, mapping = []) {
    if (!Array.isArray(mapping) || !mapping.length) return null
    if (!specInput) return null
    const spec = cloneValue(specInput)
    if (Array.isArray(mapping) && mapping.length) {
      const targetWells = mapping
        .map((m) => m?.target_well)
        .filter(Boolean)
      if (targetWells.length) {
        spec.target_wells = Array.from(new Set(targetWells))
      }
    }
    return spec
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
    const events = getActiveActivity()?.plate_events || []
    updateNowTime(events)
    setCursorToNow()
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
    updateNowTime(activity.plate_events)
    setCursorToNow()
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

  function generateLabwareId() {
    return `labware:LW-${Math.random().toString(36).slice(2, 8)}`
  }

  function upsertLabwareInstance(instance = {}) {
    if (!instance?.['@id']) return null
    ensureLabwareInstances()
    const idx = state.run.data.labware_instances.findIndex((lw) => lw?.['@id'] === instance['@id'])
    if (idx >= 0) {
      state.run.data.labware_instances[idx] = { ...state.run.data.labware_instances[idx], ...cloneValue(instance) }
    } else {
      state.run.data.labware_instances.push(cloneValue(instance))
    }
    return instance['@id']
  }

  function upsertPaletteEntry(entry = {}) {
    if (!entry?.labwareId) return null
    const layoutIndex =
      entry.layoutIndex ||
        resolvePaletteLayoutIndex({
          labwareId: entry.labwareId,
          kind: entry.kind,
          layoutRef: normalizeLayoutRef(entry.layoutRef || entry.layout_ref, entry.kind)
        })
    const layoutRef = normalizeLayoutRef(entry.layoutRef || entry.layout_ref, entry.kind)
    const payload = {
      ...cloneValue(entry),
      id: entry.id || entry.labwareId,
      labwareId: entry.labwareId,
      layoutIndex,
      ...(layoutRef ? { layoutRef } : {})
    }
    const existing = state.sourcePalette.filter((p) => p?.labwareId !== entry.labwareId)
    state.sourcePalette = [...existing, { archived: false, ...payload }]
    if (!state.activeSourceId || state.activeSourceId === entry.labwareId || state.activeSourceId === '') {
      state.activeSourceId = entry.labwareId
    }
    return payload
  }

  function addTemplatePaletteEntry(options = {}) {
    const labwareId = options.labwareId || generateLabwareId()
    const layoutRef = normalizeLayoutRef(options.layoutRef || options.kind || 'plate96', options.kind)
    const labwareInstance = {
      '@id': labwareId,
      kind: options.kind || 'plate',
      label: options.label || labwareId,
      depletion_mode: options.depletionMode || 'non_depleting',
      layoutRef
    }
    upsertLabwareInstance(labwareInstance)
    return upsertPaletteEntry({
      id: options.id || labwareId,
      labwareId,
      type: options.type || 'template',
      label: labwareInstance.label,
      kind: labwareInstance.kind,
      layoutRef,
      layoutIndex:
        options.layoutIndex ||
        resolvePaletteLayoutIndex({
          labwareId,
          kind: labwareInstance.kind,
          layoutRef
        }),
      runId: null,
      archived: false,
      roleHint: options.roleHint || ''
    })
  }

  function pruneLegacyOperations() {
    if (state.run?.data?.operations) {
      delete state.run.data.operations
    }
  }

  function addRunDerivedPaletteEntry(options = {}) {
    if (!options.runId || !options.labwareId) return null
    const layoutRef = normalizeLayoutRef(options.layoutRef || options.kind || '', options.kind)
    const entry = upsertPaletteEntry({
      id: options.id || options.labwareId,
      labwareId: options.labwareId,
      type: 'run-derived',
      label: options.label || options.labwareId,
      kind: options.kind || 'plate',
      layoutRef,
      layoutIndex: options.layoutIndex || templateLayoutForKind(options.kind || 'plate96'),
      runId: options.runId,
      archived: Boolean(options.archived),
      roleHint: options.roleHint || ''
    })
    loadRunDerivedEntry(entry)
    return entry
  }

  function archivePaletteEntry(labwareId) {
    if (!labwareId) return
    state.sourcePalette = state.sourcePalette.map((entry) =>
      entry?.labwareId === labwareId ? { ...entry, archived: true } : entry
    )
    if (state.activeSourceId === labwareId) {
      const next = state.sourcePalette.find((entry) => entry && !entry.archived)
      state.activeSourceId = next?.labwareId || ''
    }
  }

  function setActiveSourceId(labwareId) {
    const exists = state.sourcePalette.find((entry) => entry?.labwareId === labwareId && !entry.archived)
    if (exists) {
      state.activeSourceId = labwareId
      if (exists.type === 'run-derived') loadRunDerivedEntry(exists)
    }
  }

  function getActiveSourceEntry() {
    if (!state.activeSourceId) return null
    return state.sourcePalette.find((entry) => entry?.labwareId === state.activeSourceId && !entry.archived) || null
  }

  function setDestination(labwareId) {
    if (!labwareId) return
    state.selectedDestinationId = labwareId
    
    // Check if it's a source palette entry
    const paletteEntry = state.sourcePalette.find((entry) => entry?.labwareId === labwareId && !entry.archived)
    if (paletteEntry) {
      state.destinationPlate = {
        id: paletteEntry.labwareId,
        label: paletteEntry.label || paletteEntry.labwareId,
        kind: paletteEntry.kind || 'plate',
        layoutIndex: paletteEntry.layoutIndex || state.layoutIndex
      }
    } else {
      // Reset to primary plate
      seedDestinationPlate()
    }
    ensureDestinationInstance()
    syncDerivedWellsFromEvents()
  }

  function setDestinationType(plateType) {
    if (!plateType) return
    const newLayoutIndex = templateLayoutForKind(plateType)
    state.destinationPlate = {
      ...state.destinationPlate,
      kind: plateType,
      layoutIndex: newLayoutIndex
    }
    ensureDestinationInstance()
    // Don't update global layoutIndex - only destination plate
    syncDerivedWellsFromEvents()
  }

  function resolveSourceLabwareRef(labwareId = '') {
    const targetId = labwareId || state.activeSourceId
    const entry =
      state.sourcePalette.find((candidate) => candidate?.labwareId === targetId && !candidate.archived) || null
    if (entry) {
      return {
        '@id': entry.labwareId,
        kind: entry.kind || 'plate',
        label: entry.label || entry.labwareId
      }
    }
    // Fallback to destination if no source palette is active
    return resolvePrimaryLabwareRef()
  }

  function resolveDestinationLabwareRef() {
    if (state.destinationPlate?.id) {
      return {
        '@id': state.destinationPlate.id,
        kind: state.destinationPlate.kind || 'plate',
        label: state.destinationPlate.label || state.destinationPlate.id
      }
    }
    return resolvePrimaryLabwareRef()
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
    updateNowTime(activity.plate_events)
    setCursorToNow()
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
      amount: payload.volume,
      stockConcentration: payload.concentration,
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
    const targetLabware = resolveLabwareRef(options.targetLabware) || resolveDestinationLabwareRef()
    const sourceLabware =
      (options.sourceLabware && resolveLabwareRef(options.sourceLabware)) || resolveSourceLabwareRef()
    const materialId = options.material
    const volume = normalizeVolume(options.amount) || { value: 1, unit: 'uL' }
    const mapping = Array.isArray(options.mapping)
      ? options.mapping.map((entry) => ({
          ...entry,
          source_well: normalizeWellIdString(entry?.source_well),
          target_well: normalizeWellIdString(entry?.target_well),
          volume: normalizeVolume(entry?.volume)
        }))
      : []
    const selected = Array.isArray(options.wells) ? options.wells.map(normalizeWellIdString) : []

    const sourceWellId = normalizeWellIdString(options.sourceWell || options.mapping?.[0]?.source_well || 'A01')

    if (!mapping.length && selected.length) {
      selected.forEach((wellId) => {
        mapping.push({
          source_well: sourceWellId,
          target_well: wellId,
          volume
        })
      })
    }
    const simplified = simplifyVolumePlacement(mapping, volume)
    const mappingSpec = resolveMappingSpec(options.mappingSpec, simplified.mapping)
    return {
      event_type: 'transfer',
      details: {
        type: 'transfer',
        source_labware: sourceLabware?.['@id'] || sourceLabware,
        target_labware: targetLabware?.['@id'] || targetLabware,
        mapping: simplified.mapping,
        ...(mappingSpec ? { mapping_spec: mappingSpec } : {}),
        volume: simplified.volume,
        ...(materialId ? { material_id: materialId } : {})
      }
    }
  }

  function buildWashEvent(options = {}) {
    const activity = getActiveActivity()
    if (!activity) return null
    const targetLabware = resolveLabwareRef(options.targetLabware) || resolveDestinationLabwareRef()
    const targetLabwareId = targetLabware?.['@id'] || targetLabware
    return {
      event_type: 'wash',
      details: {
        type: 'wash',
        target_labware: targetLabwareId,
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
    const instances = state.run?.data?.labware_instances || []
    const findInstance = (id) => instances.find((inst) => inst?.['@id'] === id)
    const bindings =
      state.run?.data?.labware_bindings || state.run?.labware_bindings || state.run?.metadata?.labware_bindings
    if (labwareInput && typeof labwareInput === 'string') {
      const bound = bindings?.[labwareInput]
      if (bound) {
        const inst = findInstance(bound)
        return inst || {
          '@id': bound,
          kind: guessLabwareKind(bound),
          label: labwareInput
        }
      }
      if (labwareInput === 'plate') {
        return resolvePrimaryLabwareRef()
      }
      const inst = findInstance(labwareInput)
      if (inst) return inst
      return {
        '@id': labwareInput,
        kind: guessLabwareKind(labwareInput),
        label: labwareInput
      }
    }
    return resolvePrimaryLabwareRef()
  }

  function resolveLabwareKind(idOrLabel = '') {
    const instances = state.run?.data?.labware_instances || []
    const match = instances.find((inst) => inst?.['@id'] === idOrLabel)
    if (match?.kind) return match.kind
    return guessLabwareKind(idOrLabel)
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
      const target = evt?.details?.target_labware || evt?.labware?.[1] || evt?.labware?.[0]
      if (target) targetIds.add(typeof target === 'string' ? target : target['@id'])
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

  function buildDepletionByLabwareId() {
    const map = {}
    const instances = state.run?.data?.labware_instances || []
    instances.forEach((instance) => {
      const id = instance?.['@id']
      if (!id) return
      if (instance.depletion_mode === 'depleting') map[id] = true
      if (instance.depletion_mode === 'non_depleting') map[id] = false
    })
    return map
  }

  function availableLabwareIds(events = []) {
    const ids = new Set()
    const bindings = state.run?.data?.labware_bindings || {}
    Object.values(bindings || {}).forEach((val) => val && ids.add(val))
    events.forEach((evt) => {
      const refs = []
      if (Array.isArray(evt?.labware)) refs.push(...evt.labware)
      if (evt?.details?.source_labware) refs.push(evt.details.source_labware)
      if (evt?.details?.target_labware) refs.push(evt.details.target_labware)
      refs.forEach((lwId) => {
        if (!lwId) return
        const id = typeof lwId === 'string' ? lwId : lwId['@id']
        if (id && !id.startsWith('virtual/')) ids.add(id)
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

  function resolvePaletteLayoutIndex({ labwareId, kind, layoutRef } = {}) {
    const templates = LABWARE_TEMPLATES || {}
    const templateKey =
      (layoutRef && String(layoutRef).replace(/^template:/, '')) ||
      kind ||
      resolveLabwareKind(labwareId)
    if (templateKey && templates[templateKey]) {
      return templateLayoutForKind(templateKey)
    }
    // Handle coarse kinds
    if (templateKey && templateKey.startsWith('reservoir-')) {
      return templateLayoutForKind(templateKey)
    }
    if (templateKey === 'reservoir') return templateLayoutForKind('reservoir-12')
    return templateLayoutForKind('plate96')
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
          let stockConcentration = comp.stockConcentration || null
          if (!stockConcentration && comp.moles && comp.volumeL) {
            const molarity = comp.volumeL ? comp.moles / comp.volumeL : 0
            if (Number.isFinite(molarity) && molarity > 0) {
              stockConcentration = { value: Number((molarity * 1e6).toFixed(2)), unit: 'uM' }
            }
          }
          inputs.push({
            material: {
              id: comp.materialId,
              label,
              stock_concentration: stockConcentration
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

  function normalizeVolume(amount, defaultUnit = 'uL') {
    if (!amount) return null
    if (typeof amount === 'object' && amount.value !== undefined && amount.unit) {
      return {
        value: Number(amount.value),
        unit: amount.unit
      }
    }
    if (typeof amount === 'string') {
      const match = amount.trim().match(/^([\d.]+)\s*([a-zA-Z]+)$/)
      if (match) {
        return {
          value: Number(match[1]),
          unit: match[2]
        }
      }
    }
    if (typeof amount === 'number') {
      return { value: amount, unit: defaultUnit }
    }
    return null
  }

  function formatVolume(amount) {
    const normalized = normalizeVolume(amount)
    if (!normalized) return ''
    return `${normalized.value} ${normalized.unit}`
  }

  function cloneValue(value) {
    if (value === null || value === undefined) return value
    return JSON.parse(JSON.stringify(value))
  }

  function normalizeWellIdString(wellId = '') {
    if (typeof wellId !== 'string') return wellId
    const match = wellId.trim().match(/^([A-Za-z]+)(\d{1,3})$/)
    if (!match) return wellId.trim()
    const row = match[1].toUpperCase()
    const col = match[2].padStart(2, '0')
    return `${row}${col}`
  }

  function durationToMs(duration = '') {
    if (typeof duration !== 'string') return null
    const match = duration.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
    if (!match) return null
    const hours = Number(match[1] || 0)
    const minutes = Number(match[2] || 0)
    const seconds = Number(match[3] || 0)
    return (hours * 3600 + minutes * 60 + seconds) * 1000
  }

  function eventTimeMs(evt = {}) {
    const tsActual = evt.timestamp_actual || evt.timestamp
    const parsedActual = Date.parse(tsActual || '')
    if (Number.isFinite(parsedActual)) return parsedActual
    const offsetMs = durationToMs(evt.t_offset || '')
    if (Number.isFinite(offsetMs)) return offsetMs
    return null
  }

  function volumesEqual(a, b) {
    if (!a || !b) return false
    return Number(a.value) === Number(b.value) && String(a.unit || '').toLowerCase() === String(b.unit || '').toLowerCase()
  }

  function simplifyVolumePlacement(mapping = [], defaultVolume = null) {
    const volumes = mapping.map((m) => m?.volume).filter(Boolean)
    const normalizedDefault = normalizeVolume(defaultVolume)
    let uniformVolume = null
    if (volumes.length) {
      const first = volumes[0]
      const allSame = volumes.every((v) => volumesEqual(v, first))
      if (allSame) {
        uniformVolume = first
      }
    } else if (normalizedDefault) {
      uniformVolume = normalizedDefault
    }

    const nextMapping = mapping.map((m) => {
      const copy = { ...m }
      if (!copy.volume) {
        delete copy.volume
      } else if (uniformVolume && volumesEqual(copy.volume, uniformVolume)) {
        delete copy.volume
      }
      return copy
    })

    if (volumes.length && !uniformVolume) {
      return { mapping: nextMapping, volume: null }
    }
    return { mapping: nextMapping, volume: uniformVolume }
  }

  function normalizeEventPayload(eventInput = {}) {
    if (eventInput.event_type && eventInput.details) {
      const planned = isPlannedRun()
      const timestampActual = planned ? eventInput.timestamp_actual ?? null : eventInput.timestamp_actual || eventInput.timestamp || new Date().toISOString()
      if (eventInput.timestamp && !eventInput.timestamp_actual && !planned) {
        warnOnce('legacy-timestamp', 'PlateEvent.timestamp is deprecated; using timestamp_actual instead.')
      }
      const tOffset = eventInput.t_offset || (planned ? 'PT0S' : null)
      const labwareIds = Array.isArray(eventInput.labware)
        ? eventInput.labware.map((lw) => (typeof lw === 'string' ? lw : lw?.['@id'])).filter(Boolean)
        : []
      return {
        id: eventInput.id || generateEventId(),
        event_type: eventInput.event_type,
        timestamp_actual: timestampActual,
        t_offset: tOffset,
        ...(labwareIds.length ? { labware: labwareIds } : {}),
        details: cloneValue(eventInput.details)
      }
    }
    return null
  }

  function generateEventId() {
    return `evt-${Math.random().toString(36).slice(2, 9)}`
  }

  function isPlannedRun() {
    const stateValue =
      state.run?.metadata?.state ||
      state.run?.data?.state ||
      state.run?.state ||
      ''
    return String(stateValue).toLowerCase() === 'planned'
  }

  function generateActivityId() {
    return `act-${Math.random().toString(36).slice(2, 7)}`
  }

  function syncDerivedWellsFromEvents() {
    const activity = getActiveActivity()
    const plateEvents = Array.isArray(activity?.plate_events) ? activity.plate_events : []
    updateNowTime(plateEvents)
    if (!plateEvents.length) {
      state.derivedWells = {}
      state.derivedWellsByLabware = {}
      state.derivedWellsNowByLabware = {}
      return
    }
    const filteredEvents = filterEventsByCursor(plateEvents, state.cursor)
    const plateState = plateStateAtTime(filteredEvents, null, {
      depletionDefaults: optionsDepletionDefaults(),
      depletionByLabwareId: buildDepletionByLabwareId()
    })
    const plateStateNow = plateStateAtTime(plateEvents, null, {
      depletionDefaults: optionsDepletionDefaults(),
      depletionByLabwareId: buildDepletionByLabwareId()
    })
    const byLabware = {}
    const byLabwareNow = {}
    Object.entries(plateState || {}).forEach(([labwareId, wellsState]) => {
      byLabware[labwareId] = toWellInputs(wellsState || {}, state.materialLibrary)
    })
    Object.entries(plateStateNow || {}).forEach(([labwareId, wellsState]) => {
      byLabwareNow[labwareId] = toWellInputs(wellsState || {}, state.materialLibrary)
    })
    state.derivedWellsByLabware = byLabware
    state.derivedWellsNowByLabware = byLabwareNow
    const labwareId = resolveActiveLabwareId(filteredEvents)
    state.activeLabwareId = labwareId
  }

  function filterEventsByCursor(events = [], cursor = '') {
    const sorted = sortEventsStable(events)
    if (!cursor) return sorted
    const cursorTs = Date.parse(cursor)
    if (!Number.isFinite(cursorTs)) return sorted
    return sorted.filter((evt) => {
      const ts = eventTimeMs(evt)
      if (!Number.isFinite(ts)) return true
      return ts <= cursorTs
    })
  }

  function computeNowTime(events = []) {
    let maxTs = Number.NEGATIVE_INFINITY
    events.forEach((evt) => {
      const ts = eventTimeMs(evt)
      if (Number.isFinite(ts) && ts > maxTs) maxTs = ts
    })
    if (Number.isFinite(maxTs)) {
      return new Date(maxTs).toISOString()
    }
    return resolveRunCreatedAt()
  }

  function resolveRunCreatedAt() {
    return state.run?.metadata?.createdAt || state.run?.metadata?.created_at || state.run?.createdAt || ''
  }

  function updateNowTime(events = []) {
    state.nowTime = computeNowTime(events)
  }

  function setCursorToNow() {
    state.cursor = state.nowTime || ''
  }

  function isInspecting() {
    const nowTs = Date.parse(state.nowTime || '')
    const cursorTs = Date.parse(state.cursor || '')
    if (!Number.isFinite(nowTs) || !Number.isFinite(cursorTs)) return false
    return cursorTs < nowTs
  }

  function setCursor(timestamp) {
    state.cursor = timestamp || state.nowTime || ''
    syncDerivedWellsFromEvents()
  }

  async function loadRunDerivedEntry(entry = {}) {
    if (!entry?.runId || !entry?.labwareId || !state.runLoader) return
    if (state.runDerivedWells[entry.labwareId]) return
    state.runDerivedStatus[entry.labwareId] = { loading: true, error: '' }
    try {
      const runRecord = await state.runLoader(entry.runId)
      const events = []
      const activities = runRecord?.data?.activities
      if (Array.isArray(activities)) {
        activities.forEach((act) => {
          if (Array.isArray(act?.plate_events)) {
            const cleaned = act.plate_events.map((evt) => sanitizeTransferEvent(evt)).filter(Boolean)
            events.push(...cleaned)
          }
        })
      }
      const plateState = plateStateAtTime(events, null, {
        depletionDefaults: optionsDepletionDefaults(),
        depletionByLabwareId: buildDepletionByLabwareId()
      })
      const wells = toWellInputs(plateState?.[entry.labwareId] || {}, state.materialLibrary)
      state.runDerivedWells = {
        ...state.runDerivedWells,
        [entry.labwareId]: wells
      }
      state.runDerivedStatus[entry.labwareId] = { loading: false, error: '' }
    } catch (err) {
      state.runDerivedStatus[entry.labwareId] = { loading: false, error: err?.message || 'Failed to load run' }
    }
  }

  function getSelectionSnapshot() {
    return {
      anchor: state.selection.anchor,
      wells: [...state.selection.wells]
    }
  }

  function getDerivedWells(labwareId) {
    if (!labwareId) {
      const cached = state.runDerivedWells[state.activeLabwareId]
      if (cached) return cached
      return state.derivedWellsByLabware[state.activeLabwareId] || {}
    }
    return state.runDerivedWells[labwareId] || state.derivedWellsByLabware[labwareId] || {}
  }

  function getDerivedWellsAtNow(labwareId) {
    if (!labwareId) return getDerivedWells(state.activeLabwareId)
    return state.runDerivedWells[labwareId] || state.derivedWellsNowByLabware[labwareId] || {}
  }

  function sortEventsStable(events = []) {
    return (events || [])
      .map((evt, index) => ({ evt, index }))
      .sort((a, b) => {
        const tsA = eventTimeMs(a.evt)
        const tsB = eventTimeMs(b.evt)
        const diff = (Number.isFinite(tsA) ? tsA : 0) - (Number.isFinite(tsB) ? tsB : 0)
        if (diff !== 0) return diff
        return a.index - b.index
      })
      .map((entry) => entry.evt)
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
    resolveDestinationLabwareRef,
    resolveSourceLabwareRef,
    deriveLabwareBindings,
    derivePaletteData,
    runDerivedStatus: state.runDerivedStatus,
    getDerivedWells,
    getDerivedWellsAtNow,
    isInspecting,
    addTemplatePaletteEntry,
    addRunDerivedPaletteEntry,
    archivePaletteEntry,
    setActiveSourceId,
    getActiveSourceEntry,
    setDestination,
    setDestinationType,
    buildValidationPayload,
    sanitizeTransfers
  }
}
