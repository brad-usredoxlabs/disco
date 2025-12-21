import { createLayoutIndex } from './layoutUtils'
import { resolveLabwareLayout } from './labwareLibrary'

const PLATE_TYPE_PRESETS = {
  '6': { kind: 'plate6', wellKeying: 'A01' },
  plate6: { kind: 'plate6', wellKeying: 'A01' },
  plate_6: { kind: 'plate6', wellKeying: 'A01' },
  '12': { kind: 'plate12', wellKeying: 'A01' },
  plate12: { kind: 'plate12', wellKeying: 'A01' },
  plate_12: { kind: 'plate12', wellKeying: 'A01' },
  '24': { kind: 'plate24', wellKeying: 'A01' },
  plate24: { kind: 'plate24', wellKeying: 'A01' },
  plate_24: { kind: 'plate24', wellKeying: 'A01' },
  '48': { kind: 'plate48', wellKeying: 'A01' },
  plate48: { kind: 'plate48', wellKeying: 'A01' },
  plate_48: { kind: 'plate48', wellKeying: 'A01' },
  '96': { kind: 'plate96', wellKeying: 'A01' },
  plate96: { kind: 'plate96', wellKeying: 'A01' },
  plate_96: { kind: 'plate96', wellKeying: 'A01' },
  '96-flat-clear': { kind: 'plate96', wellKeying: 'A01' },
  plate384: { kind: 'plate384', wellKeying: 'A01' },
  '384': { kind: 'plate384', wellKeying: 'A01' },
  plate_384: { kind: 'plate384', wellKeying: 'A01' },
  reservoir8: { kind: 'reservoir8', wellKeying: 'R1C1' },
  reservoir_8: { kind: 'reservoir8', wellKeying: 'R1C1' },
  reservoir12: { kind: 'reservoir12', wellKeying: 'R1C1' },
  reservoir_12: { kind: 'reservoir12', wellKeying: 'R1C1' },
  reservoir: { kind: 'reservoir12', wellKeying: 'R1C1' },
  tubeset6: { kind: 'tubeset6', wellKeying: 'T01' },
  tubeset_6: { kind: 'tubeset6', wellKeying: 'T01' },
  tubeset8: { kind: 'tubeset8', wellKeying: 'T01' },
  tubeset_8: { kind: 'tubeset8', wellKeying: 'T01' },
  tubeset12: { kind: 'tubeset12', wellKeying: 'T01' },
  tubeset_12: { kind: 'tubeset12', wellKeying: 'T01' },
  tubeset: { kind: 'tubeset12', wellKeying: 'T01' },
  tube: { kind: 'tube', wellKeying: 'T01' }
}

export function resolveLayoutIndex(layoutInput = {}, options = {}) {
  const fallbackKind = options.fallbackKind || 'plate96'
  const layout = normalizeLayout(layoutInput, fallbackKind)
  return createLayoutIndex(layout)
}

export function resolveLayoutFromRole(role = {}, options = {}) {
  if (!role || typeof role !== 'object') {
    return resolveLayoutIndex({}, options)
  }
  if (role.layout && typeof role.layout === 'object') {
    return resolveLayoutIndex(role.layout, options)
  }
  if (role.plate_type) {
    const preset = presetForPlateType(role.plate_type)
    if (preset) {
      return resolveLayoutIndex(preset, options)
    }
  }
  return resolveLayoutIndex({}, options)
}

function normalizeLayout(layout = {}, fallbackKind = 'plate96') {
  const fromLibrary = resolveLabwareLayout(layout)
  if (fromLibrary) {
    return normalizeLayoutShape(fromLibrary, fallbackKind)
  }
  if (typeof layout === 'string') {
    const preset = presetForPlateType(layout) || presetForPlateLabel(layout)
    if (preset) return preset
    return { kind: fallbackKind }
  }
  return normalizeLayoutShape(layout, fallbackKind)
}

function normalizeLayoutShape(layout = {}, fallbackKind = 'plate96') {
  const kind = layout.kind || fallbackKind
  const wellKeying = layout.wellKeying || presetForPlateType(kind)?.wellKeying || 'A01'
  const normalized = {
    kind,
    wellKeying
  }
  if (layout.dimensions && typeof layout.dimensions === 'object') {
    const rows = Number(layout.dimensions.rows)
    const columns = Number(layout.dimensions.columns)
    if (Number.isFinite(rows) && rows > 0 && Number.isFinite(columns) && columns > 0) {
      normalized.dimensions = { rows, columns }
    }
  }
  return normalized
}

function presetForPlateType(plateType = '') {
  const key = String(plateType || '').toLowerCase()
  return PLATE_TYPE_PRESETS[key] || null
}

function presetForPlateLabel(label = '') {
  const lower = String(label || '').toLowerCase()
  if (lower.includes('384')) return PLATE_TYPE_PRESETS['384']
  if (lower.includes('96')) return PLATE_TYPE_PRESETS['96']
  if (lower.includes('48')) return PLATE_TYPE_PRESETS['48']
  if (lower.includes('24')) return PLATE_TYPE_PRESETS['24']
  if (lower.includes('12')) return PLATE_TYPE_PRESETS['12']
  if (lower.includes('6')) return PLATE_TYPE_PRESETS['6']
  return null
}
