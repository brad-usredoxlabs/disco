import { attachActiveRevision, resolveActiveRevision } from './revisionResolver'

export function resolveLatestMaterialRevision(revisions = [], materialId = '') {
  return resolveActiveRevision(revisions, materialId, { ofField: 'of_material' })
}

export function attachLatestRevision(materials = [], revisions = []) {
  return attachActiveRevision(materials, revisions, { idField: 'id', ofField: 'of_material' })
}
