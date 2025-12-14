const LAYOUT_PRESETS = {
  plate96: {
    rows: 8,
    columns: 12,
    wellKeying: 'A01'
  },
  plate384: {
    rows: 16,
    columns: 24,
    wellKeying: 'A01'
  },
  tubeset: {
    rows: 1,
    columns: 12,
    wellKeying: 'T01'
  },
  tube: {
    rows: 1,
    columns: 1,
    wellKeying: 'T01'
  }
}

export function createLayoutIndex(layout = {}) {
  const preset = LAYOUT_PRESETS[layout.kind] || LAYOUT_PRESETS.plate96
  const rows = Number(layout.dimensions?.rows) || preset.rows
  const columns = Number(layout.dimensions?.columns) || preset.columns
  const wellKeying = layout.wellKeying || preset.wellKeying || 'A01'
  const rowLabels = buildRowLabels(rows)
  const columnLabels = buildColumnLabels(columns)
  const positionById = {}
  const wells = []

  rowLabels.forEach((rowLabel, rowIndex) => {
    columnLabels.forEach((columnNumber, columnIndex) => {
      const wellId = formatWellId(rowLabel, columnNumber, wellKeying, rowIndex)
      wells.push(wellId)
      positionById[wellId] = {
        rowIndex,
        columnIndex,
        rowLabel,
        columnNumber
      }
    })
  })

  return {
    kind: layout.kind || 'plate96',
    rows,
    columns,
    rowLabels,
    columnLabels,
    wellKeying,
    positionById,
    wells
  }
}

export function computeRangeSelection(anchorId, targetId, layoutIndex) {
  if (!layoutIndex || !anchorId || !targetId) return []
  const anchor = layoutIndex.positionById[anchorId]
  const target = layoutIndex.positionById[targetId]
  if (!anchor || !target) return []
  const rowStart = Math.min(anchor.rowIndex, target.rowIndex)
  const rowEnd = Math.max(anchor.rowIndex, target.rowIndex)
  const colStart = Math.min(anchor.columnIndex, target.columnIndex)
  const colEnd = Math.max(anchor.columnIndex, target.columnIndex)
  const selection = []

  for (let r = rowStart; r <= rowEnd; r += 1) {
    const rowLabel = layoutIndex.rowLabels[r]
    for (let c = colStart; c <= colEnd; c += 1) {
      const columnNumber = layoutIndex.columnLabels[c]
      const wellId = formatWellId(rowLabel, columnNumber, layoutIndex.wellKeying, r)
      selection.push(wellId)
    }
  }
  return selection
}

export function formatWellId(rowLabel, columnNumber, keying = 'A01', rowIndex = 0) {
  if (keying === 'R1C1') {
    return `R${rowIndex + 1}C${columnNumber}`
  }
  if (keying === 'T01') {
    return `T${String(columnNumber).padStart(2, '0')}`
  }
  return `${rowLabel}${String(columnNumber).padStart(2, '0')}`
}

function buildRowLabels(count) {
  const labels = []
  for (let index = 0; index < count; index += 1) {
    labels.push(letterForIndex(index))
  }
  return labels
}

function buildColumnLabels(count) {
  return Array.from({ length: count }, (_v, index) => index + 1)
}

function letterForIndex(index) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (index < alphabet.length) {
    return alphabet[index]
  }
  const first = Math.floor(index / alphabet.length) - 1
  const second = index % alphabet.length
  return `${alphabet[first]}${alphabet[second]}`
}
