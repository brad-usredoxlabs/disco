/**
 * Derive well contents by replaying structured PlateEvents.
 * Returns a map compatible with the legacy `wells` structure used by PlateGrid.
 */
export function deriveWellsFromEvents(events = [], options = {}) {
  if (!Array.isArray(events) || !events.length) return {}
  const sorted = [...events].sort(compareEventTimestamps)
  const wells = {}
  sorted.forEach((event) => {
    if (!event || !event.event_type || !event.details) return
    switch (event.event_type) {
      case 'transfer':
        applyTransferEvent(wells, event, options)
        break
      case 'wash':
        applyWashEvent(wells, event, options)
        break
      default:
        break
    }
  })
  pruneEmptyWells(wells)
  return wells
}

function compareEventTimestamps(a = {}, b = {}) {
  const aTs = Date.parse(a.timestamp || '') || 0
  const bTs = Date.parse(b.timestamp || '') || 0
  return aTs - bTs
}

function applyTransferEvent(wellMap, event, options = {}) {
  const targetWells = resolveTargetWells(event.details)
  if (!targetWells || typeof targetWells !== 'object') return
  const sourceWells = resolveSourceWells(event.details)
  Object.entries(targetWells).forEach(([key, descriptor = {}]) => {
    const wellId = descriptor.well || key
    if (!wellId) return
    const transferInfo = resolveTransferInfo({
      targetValues: descriptor,
      sourceValues: sourceWells[key] || sourceWells[descriptor.well] || sourceWells[wellId],
      event
    })
    const materialId = transferInfo.materialId || lookupMaterialId(transferInfo.materialLabel, options)
    const role = transferInfo.role || 'treatment'
    if (!materialId) return
    const well = ensureWellEntry(wellMap, wellId)
    // Remove existing entry for same material/role combo
    well.inputs = well.inputs.filter((entry) => !(entry.material?.id === materialId && entry.role === role))
    const entry = {
      material: { id: materialId },
      role
    }
    if (transferInfo.amount) {
      entry.amount = transferInfo.amount
    }
    if (transferInfo.notes) {
      entry.notes = transferInfo.notes
    }
    well.inputs.push(entry)
  })
}

function resolveTransferInfo({ targetValues = {}, sourceValues = {}, event = {} }) {
  const materialId = targetValues.material_id || event.details?.material_id || sourceValues?.material_id || ''
  const materialLabel =
    (sourceValues?.material && resolveMaybeLabel(sourceValues.material)) ||
    event.details?.material?.label ||
    targetValues.material_label
  const role = targetValues.role || sourceValues?.role || event.details?.role || ''
  const notes = targetValues.notes || ''
  const amountString = targetValues.volume || sourceValues?.volume || event.details?.volume || ''
  const amount = parseAmountString(amountString)
  return {
    materialId,
    materialLabel,
    role,
    notes,
    amount
  }
}

function resolveTargetWells(details = {}) {
  if (details?.target?.wells && typeof details.target.wells === 'object') {
    return details.target.wells
  }
  if (Array.isArray(details?.mapping)) {
    const map = {}
    details.mapping.forEach((entry) => {
      if (!entry?.target_well) return
      map[entry.target_well] = {
        well: entry.target_well,
        material_id: details.material?.id || details.material_id || '',
        material_label: details.material?.label || '',
        role: details.role || entry.role || '',
        volume: details.volume || entry.volume || ''
      }
    })
    return map
  }
  return null
}

function resolveSourceWells(details = {}) {
  if (details?.source?.wells && typeof details.source.wells === 'object') {
    return details.source.wells
  }
  if (Array.isArray(details?.mapping)) {
    const map = {}
    details.mapping.forEach((entry) => {
      if (!entry?.source_well) return
      map[entry.source_well] = {
        well: entry.source_well,
        material_id: details.material?.id || details.material_id || '',
        material_label: details.material?.label || '',
        role: details.role || entry.role || '',
        volume: details.volume || entry.volume || ''
      }
    })
    return map
  }
  return {}
}

function applyWashEvent(wellMap, event, options = {}) {
  const targetWells = Array.isArray(event.details?.wells) ? event.details.wells : []
  if (!targetWells.length) return
  const bufferId = resolveBufferId(event.details?.buffer, options)
  targetWells.forEach((wellId) => {
    const entry = wellMap[wellId]
    if (!entry) return
    if (bufferId) {
      entry.inputs = entry.inputs.filter((input) => input.material?.id !== bufferId)
      if (!entry.inputs.length) {
        delete wellMap[wellId]
      }
    } else {
      delete wellMap[wellId]
    }
  })
}

function resolveBufferId(bufferRef = {}, options = {}) {
  if (!bufferRef) return ''
  if (bufferRef.id) return bufferRef.id
  return lookupMaterialId(resolveMaybeLabel(bufferRef), options)
}

function lookupMaterialId(label, options = {}) {
  if (!label) return ''
  const byLabel = options.materialsByLabel || {}
  if (byLabel[label]) return byLabel[label]
  if (typeof label === 'string' && label.startsWith('material:')) {
    return label
  }
  return `material:${slugify(label)}`
}

function resolveMaybeLabel(ref = {}) {
  if (typeof ref === 'string') return ref
  if (ref && typeof ref === 'object') {
    return ref.label || ref.name || ''
  }
  return ''
}

function ensureWellEntry(wellMap, wellId) {
  if (!wellMap[wellId]) {
    wellMap[wellId] = { inputs: [] }
  }
  if (!Array.isArray(wellMap[wellId].inputs)) {
    wellMap[wellId].inputs = []
  }
  return wellMap[wellId]
}

function pruneEmptyWells(wellMap = {}) {
  Object.entries(wellMap).forEach(([wellId, entry]) => {
    if (!entry?.inputs?.length) {
      delete wellMap[wellId]
    }
  })
}

function parseAmountString(value = '') {
  if (typeof value !== 'string' || !value.trim()) return null
  const match = value.trim().match(/^([\d.]+)\s*([a-zA-Z%µμ]+)$/)
  if (!match) return null
  return {
    value: Number(match[1]),
    unit: match[2]
  }
}

function slugify(value = '') {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Exported for tests
export const __testables = {
  applyTransferEvent,
  applyWashEvent,
  parseAmountString,
  lookupMaterialId,
  resolveTransferInfo
}
