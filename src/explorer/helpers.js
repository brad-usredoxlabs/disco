import { normalizeVolume } from '../event-graph/units.js'

export function extractWellsFromEvent(evt = {}) {
  const wells = new Set()
  const details = evt.details || {}
  if (details.target?.wells && typeof details.target.wells === 'object') {
    Object.keys(details.target.wells).forEach((w) => wells.add(w))
  }
  if (Array.isArray(details.mapping)) {
    details.mapping.forEach((m) => {
      if (m.target_well) wells.add(m.target_well)
      if (m.source_well) wells.add(m.source_well)
    })
  }
  return Array.from(wells)
}

export function buildOverlay(labwareState = {}, options = {}) {
  const mode = options.mode || 'dominant'
  const filter = (options.filter || '').trim().toLowerCase()
  const overlay = {}
  const palette = materialPalette()
  Object.entries(labwareState).forEach(([wellId, well]) => {
    if (mode === 'volume') {
      const volL = Number.isFinite(well.totalVolumeL) ? well.totalVolumeL : normalizeVolume(well.totalVolumeL || 0, 0)
      const volUL = volL * 1e6
      const intensity = Math.min(1, volUL / 200)
      overlay[wellId] = {
        label: volUL ? `${volUL.toFixed(1)} uL` : '',
        color: `rgba(59,130,246,${0.1 + 0.6 * intensity})`,
        borderColor: 'rgba(37, 99, 235, 0.6)',
        materialId: null
      }
      return
    }
    const components = Array.isArray(well.components) ? well.components : []
    if (!components.length) return
    let winner = components[0]
    if (mode === 'dominant') {
      winner = [...components].sort((a, b) => (b.moles || 0) - (a.moles || 0))[0]
    } else if (mode === 'material' && filter) {
      winner = components.find((c) => (c.materialId || '').toLowerCase().includes(filter))
    }
    if (!winner) return
    const color = palette[winner.materialId] || '#a855f7'
    overlay[wellId] = {
      label: winner.materialId,
      color: hexToRgba(color, 0.25),
      borderColor: hexToRgba(color, 0.6),
      materialId: winner.materialId
    }
  })
  return overlay
}

export function materialPalette() {
  const base = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#22c55e']
  const map = {}
  base.forEach((color, idx) => {
    map[`material:${idx}`] = color
  })
  return new Proxy(map, {
    get(target, prop) {
      if (prop in target) return target[prop]
      const hash = Math.abs(hashString(String(prop))) % base.length
      return base[hash]
    }
  })
}

export function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function hexToRgba(hex, alpha = 1) {
  const match = hex.replace('#', '')
  const bigint = parseInt(match, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
