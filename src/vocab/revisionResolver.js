export function resolveActiveRevision(revisions = [], conceptId = '', { ofField = 'of_material' } = {}) {
  if (!conceptId) return null
  const field = ofField || 'of_material'
  const candidates = revisions.filter((rev) => rev?.[field] === conceptId && rev?.status === 'active')
  if (!candidates.length) return null
  const sorted = [...candidates].sort((a, b) => {
    const revA = Number(a.revision) || 0
    const revB = Number(b.revision) || 0
    if (revA !== revB) return revB - revA
    const tsA = Date.parse(a.created_at || '') || 0
    const tsB = Date.parse(b.created_at || '') || 0
    return tsB - tsA
  })
  return sorted[0] || null
}

export function attachActiveRevision(
  concepts = [],
  revisions = [],
  { idField = 'id', ofField = 'of_material', prefix = '' } = {}
) {
  return (concepts || []).map((entry) => {
    const conceptId = entry?.[idField]
    if (!conceptId) return entry
    const latest = resolveActiveRevision(revisions, conceptId, { ofField })
    if (!latest) return entry
    return {
      ...entry,
      latest_revision_id: latest.id,
      latest_revision_status: latest.status,
      latest_revision: latest
    }
  })
}
