export function createWellState() {
  return {
    totalVolumeL: 0,
    components: []
  }
}

export function cloneWellState(state) {
  return {
    totalVolumeL: state?.totalVolumeL || 0,
    components: Array.isArray(state?.components)
      ? state.components.map((c) => ({ ...c }))
      : []
  }
}

export function ensureWellState(plateState, wellId) {
  if (!plateState[wellId]) {
    plateState[wellId] = createWellState()
  }
  return plateState[wellId]
}

export function addComponent(well, component) {
  const existing = well.components.find(
    (c) => c.materialId === component.materialId && c.sourceEventId === component.sourceEventId && c.sourceWell === component.sourceWell
  )
  if (existing) {
    existing.moles += component.moles
    existing.volumeL = (existing.volumeL || 0) + (component.volumeL || 0)
    if (!existing.stockConcentration && component.stockConcentration) {
      existing.stockConcentration = component.stockConcentration
    }
  } else {
    well.components.push({ ...component })
  }
}

export function removeAllComponents(well) {
  well.components = []
  well.totalVolumeL = 0
}

export function addVolume(well, deltaL) {
  if (!Number.isFinite(deltaL)) return
  well.totalVolumeL = Math.max(0, (well.totalVolumeL || 0) + deltaL)
}

export function subtractVolume(well, deltaL) {
  if (!Number.isFinite(deltaL)) return
  well.totalVolumeL = Math.max(0, (well.totalVolumeL || 0) - deltaL)
}
