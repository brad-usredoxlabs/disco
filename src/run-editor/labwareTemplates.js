import { resolveLayoutIndex } from '../plate-editor/utils/layoutResolver'

export const LABWARE_TEMPLATES = {
  'reservoir-1': { kind: 'reservoir', rows: 1, cols: 1, wellKeying: 'R1C1' },
  'reservoir-8': { kind: 'reservoir', rows: 8, cols: 1, wellKeying: 'R1C1' },
  'reservoir-12': { kind: 'reservoir', rows: 12, cols: 1, wellKeying: 'R1C1' },
  plate6: { kind: 'plate6', rows: 2, cols: 3, wellKeying: 'A01' },
  plate12: { kind: 'plate12', rows: 3, cols: 4, wellKeying: 'A01' },
  plate24: { kind: 'plate24', rows: 4, cols: 6, wellKeying: 'A01' },
  plate48: { kind: 'plate48', rows: 6, cols: 8, wellKeying: 'A01' },
  plate96: { kind: 'plate96', rows: 8, cols: 12, wellKeying: 'A01' },
  plate384: { kind: 'plate384', rows: 16, cols: 24, wellKeying: 'A01' }
}

export function templateLayoutForKind(kind = 'plate96') {
  const entry = LABWARE_TEMPLATES[kind] || LABWARE_TEMPLATES.plate96
  const layout = {
    kind: entry.kind,
    wellKeying: entry.wellKeying,
    dimensions: {
      rows: entry.rows,
      columns: entry.cols
    }
  }
  return resolveLayoutIndex(layout, { fallbackKind: entry.kind })
}
