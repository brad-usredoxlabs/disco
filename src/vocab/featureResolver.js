import { attachActiveRevision, resolveActiveRevision } from './revisionResolver'

export function resolveLatestFeatureRevision(revisions = [], featureId = '') {
  return resolveActiveRevision(revisions, featureId, { ofField: 'of_feature' })
}

export function attachLatestFeatureRevision(features = [], revisions = []) {
  return attachActiveRevision(features, revisions, { idField: 'id', ofField: 'of_feature' })
}
