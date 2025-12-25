import { normalizeVolume, normalizeConcentration } from './units.js'
import { ensureWellState, addComponent, addVolume, subtractVolume, removeAllComponents } from './state.js'

const DEFAULT_DEPLETION = {
  plate: true,
  reservoir: false,
  tube_rack: false
}

export function replayPlateEvents(events = [], options = {}) {
  const sorted = stableSortEvents(events)
  const state = {}
  const edges = []
  sorted.forEach((event) => {
    if (!event || !event.event_type) return
    if (options.focusLabwareId && !eventTouchesLabware(event, options.focusLabwareId)) return
    switch (event.event_type) {
      case 'transfer':
        applyTransferEvent(state, event, edges, options)
        break
      case 'wash':
        applyWashEvent(state, event)
        break
      case 'harvest':
        applyHarvestEvent(edges, event)
        break
      case 'sample_operation':
        applySampleOperationEvent(edges, event)
        break
      case 'read':
      case 'incubate':
      default:
        // No composition change; timeline anchors only
        break
    }
  })
  return { state, edges }
}

export function plateStateAtTime(events = [], timestamp, options = {}) {
  const cutoff = timestamp ? Date.parse(timestamp) : null
  const filtered = stableSortEvents(events).filter((evt) => {
    if (!cutoff) return true
    const ts = Date.parse(evt?.timestamp || '')
    return Number.isFinite(ts) ? ts <= cutoff : true
  })
  return replayPlateEvents(filtered, options).state
}

export function wellCompositionAtTime(events = [], timestamp, labwareId, wellId, options = {}) {
  if (!labwareId || !wellId) return null
  const state = plateStateAtTime(events, timestamp, options)
  const plate = state[labwareId] || {}
  return plate[wellId] || null
}

export function eventTimelineForLabware(events = [], labwareId) {
  if (!labwareId) return []
  return stableSortEvents(events).filter(
    (evt) => Array.isArray(evt?.labware) && evt.labware.some((l) => l?.['@id'] === labwareId)
  )
}

export function buildLineageGraph(edges = []) {
  const nodes = new Map()
  const edgeList = []
  edges.forEach((edge) => {
    const srcKey = edge.from.sampleId || `${edge.from.labwareId}:${edge.from.wellId || ''}`
    const dstKey = edge.to.sampleId || `${edge.to.labwareId}:${edge.to.wellId || ''}`
    if (!nodes.has(srcKey)) nodes.set(srcKey, edge.from)
    if (!nodes.has(dstKey)) nodes.set(dstKey, edge.to)
    edgeList.push(edge)
  })
  return { nodes: Array.from(nodes.values()), edges: edgeList }
}

function stableSortEvents(events = []) {
  return (events || []).map((evt, index) => ({ evt, index })).sort((a, b) => {
    const tsA = Date.parse(a.evt?.timestamp || '')
    const tsB = Date.parse(b.evt?.timestamp || '')
    const diff = (Number.isFinite(tsA) ? tsA : 0) - (Number.isFinite(tsB) ? tsB : 0)
    if (diff !== 0) return diff
    return a.index - b.index
  }).map((entry) => entry.evt)
}

function eventTouchesLabware(event = {}, focusLabwareId = '') {
  if (!focusLabwareId) return true
  const targetId = event.details?.target?.labware?.['@id'] || event.details?.target?.labware
  const sourceId = event.details?.source?.labware?.['@id'] || event.details?.source?.labware
  const washId = event.details?.labware?.['@id'] || event.details?.labware
  const sampleLabware = event.details?.inputs?.labware?.['@id'] || event.details?.inputs?.labware
  const listed =
    Array.isArray(event.labware) &&
    event.labware.some((lw) => (lw?.['@id'] || lw) === focusLabwareId)
  return (
    listed ||
    targetId === focusLabwareId ||
    sourceId === focusLabwareId ||
    washId === focusLabwareId ||
    sampleLabware === focusLabwareId
  )
}

function applyTransferEvent(state, event, edges, options) {
  const sourceLabware = event.details?.source?.labware?.['@id'] || event.details?.source?.labware
  const targetLabware = event.details?.target?.labware?.['@id'] || event.details?.target?.labware
  if (!sourceLabware || !targetLabware) return
  const volumeL = normalizeVolume(event.details?.volume, 0)
  const sourceDepleting = resolveDepletion(options, sourceLabware, event.details?.source?.labware?.kind)
  const targetPlate = state[targetLabware] || (state[targetLabware] = {})
  const sourcePlate = state[sourceLabware] || (state[sourceLabware] = {})

  const mapping = resolveMapping(event.details)
  mapping.forEach((pair) => {
    const srcWellId = pair.source_well
    const dstWellId = pair.target_well
    const perWellVolumeL = normalizeVolume(pair.volume || event.details?.volume, volumeL)
    if (!dstWellId || !Number.isFinite(perWellVolumeL)) return

    const srcWell = ensureWellState(sourcePlate, srcWellId)
    const dstWell = ensureWellState(targetPlate, dstWellId)
    hydrateSourceWell(srcWell, {
      event,
      sourceLabware,
      srcWellId,
      perWellVolumeL
    })
    const targetConfig = event.details?.target?.wells?.[dstWellId] || {}
    const materialDetails = targetConfig.material || event.details?.material
    const targetMaterialId =
      targetConfig.material_id || materialDetails?.id || event.details?.material_id || pair.material_id
    const fraction = srcWell.totalVolumeL > 0 ? Math.min(perWellVolumeL / srcWell.totalVolumeL, 1) : 0

    if (srcWell.components.length) {
      srcWell.components.forEach((component) => {
        const transferredMoles = fraction * (component.moles || 0)
        const volumeL =
          perWellVolumeL *
          (component.volumeL && srcWell.totalVolumeL ? component.volumeL / srcWell.totalVolumeL : 1)
        addComponent(dstWell, {
          materialId: component.materialId || targetMaterialId,
          moles: transferredMoles,
          volumeL,
          sourceEventId: event.id || event.timestamp,
          sourceLabware: sourceLabware,
          sourceWell: srcWellId
        })
        edges.push({
          eventId: event.id || '',
          from: { labwareId: sourceLabware, wellId: srcWellId },
          to: { labwareId: targetLabware, wellId: dstWellId },
          materialId: component.materialId || targetMaterialId,
          moles: transferredMoles
        })
      })
    } else if (targetMaterialId) {
      addComponent(dstWell, {
        materialId: targetMaterialId,
        moles: estimateMolesFromVolume(perWellVolumeL, materialDetails),
        volumeL: perWellVolumeL,
        sourceEventId: event.id || event.timestamp,
        sourceLabware: sourceLabware,
        sourceWell: srcWellId
      })
    }

    addVolume(dstWell, perWellVolumeL)
    if (sourceDepleting && perWellVolumeL > 0) {
      subtractVolume(srcWell, perWellVolumeL)
      if (fraction > 0 && srcWell.components.length) {
        srcWell.components.forEach((component) => {
          const removed = fraction * (component.moles || 0)
          component.moles = Math.max(0, (component.moles || 0) - removed)
        })
        srcWell.components = srcWell.components.filter((c) => (c.moles || 0) > 0)
      }
      if (srcWell.totalVolumeL === 0) {
        removeAllComponents(srcWell)
      }
    }
  })
}

function applyWashEvent(state, event) {
  const labwareId = event.details?.labware?.['@id'] || event.details?.labware
  if (!labwareId) return
  const wells = Array.isArray(event.details?.wells) && event.details.wells.length ? event.details.wells : null
  const plate = state[labwareId]
  if (!plate) return
  const targetWells = wells || Object.keys(plate)
  targetWells.forEach((wellId) => {
    const well = plate[wellId]
    if (!well) return
    removeAllComponents(well)
  })
}

function applyHarvestEvent(edges, event) {
  const inputs = event.details?.inputs || {}
  const outputs = Array.isArray(event.details?.outputs) ? event.details.outputs : []
  if (!inputs || !outputs.length) return
  outputs.forEach((out) => {
    edges.push({
      eventId: event.id || '',
      from: {
        labwareId: inputs.labware?.['@id'] || inputs.labware || '',
        wellId: Array.isArray(inputs.wells) ? inputs.wells.join(',') : ''
      },
      to: { sampleId: out['@id'] || '', label: out.label || '' },
      materialId: out.material?.id || ''
    })
  })
}

function applySampleOperationEvent(edges, event) {
  const inputs = event.details?.inputs || {}
  const outputs = Array.isArray(event.details?.outputs) ? event.details.outputs : []
  if (!outputs.length && !inputs.samples && !inputs.wells) return
  outputs.forEach((out) => {
    edges.push({
      eventId: event.id || '',
      from: {
        labwareId: inputs.labware?.['@id'] || inputs.labware || '',
        wellId: Array.isArray(inputs.wells) ? inputs.wells.join(',') : '',
        sampleId: Array.isArray(inputs.samples) ? inputs.samples.join(',') : ''
      },
      to: { sampleId: out['@id'] || '', label: out.label || '' },
      materialId: out.material?.id || ''
    })
  })
}

function resolveMapping(details = {}) {
  if (Array.isArray(details.mapping) && details.mapping.length) {
    return details.mapping
  }
  const targets = details.target?.wells || {}
  return Object.keys(targets).map((targetWell) => {
    return {
      source_well: details.source?.wells?.[targetWell]?.well || targets[targetWell].source_well || targetWell,
      target_well: targetWell,
      volume: targets[targetWell].volume
    }
  })
}

function resolveDepletion(options, labwareId, kind) {
  const map = options.depletionByLabwareId || {}
  if (labwareId && labwareId in map) return Boolean(map[labwareId])
  const normalizedKind = (kind || '').toLowerCase()
  if (normalizedKind && DEFAULT_DEPLETION.hasOwnProperty(normalizedKind)) {
    return DEFAULT_DEPLETION[normalizedKind]
  }
  return true
}

function estimateMolesFromVolume(volumeL, material = {}) {
  const conc = normalizeConcentration(material?.stock_concentration, { molarMass: material?.molar_mass })
  if (conc === null || conc === undefined) return 0
  return conc * volumeL
}

function hydrateSourceWell(srcWell, options = {}) {
  if (!srcWell || srcWell.components.length) return
  const event = options.event || {}
  const perWellVolumeL = options.perWellVolumeL || 0
  const srcWellId = options.srcWellId
  const sourceLabware = options.sourceLabware || ''
  const wellConfig = event.details?.source?.wells?.[srcWellId] || {}
  const material =
    wellConfig.material ||
    (event.details?.material && { id: event.details.material.id, stock_concentration: event.details.material.stock_concentration })
  const materialId = wellConfig.material_id || material?.id || event.details?.material_id
  if (!materialId) return
  const volumeL = normalizeVolume(wellConfig.volume, perWellVolumeL)
  addComponent(srcWell, {
    materialId,
    moles: estimateMolesFromVolume(volumeL, material),
    volumeL,
    sourceEventId: event.id || event.timestamp,
    sourceLabware,
    sourceWell: srcWellId
  })
  addVolume(srcWell, volumeL)
}
