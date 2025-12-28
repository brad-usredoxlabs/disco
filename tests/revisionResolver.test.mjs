import { describe, it, expect } from 'vitest'
import { resolveActiveRevision, attachActiveRevision } from '../src/vocab/revisionResolver.js'

describe('revisionResolver (generic)', () => {
  const revisions = [
    { id: 'rev1', of_material: 'material:one', status: 'inactive', revision: 1, created_at: '2025-01-01' },
    { id: 'rev2', of_material: 'material:one', status: 'active', revision: 1, created_at: '2025-01-02' },
    { id: 'rev3', of_material: 'material:one', status: 'active', revision: 2, created_at: '2025-01-03' }
  ]

  it('resolves newest active revision by revision then timestamp', () => {
    const latest = resolveActiveRevision(revisions, 'material:one', { ofField: 'of_material' })
    expect(latest?.id).toBe('rev3')
  })

  it('attaches latest revision metadata', () => {
    const materials = [{ id: 'material:one', label: 'One' }, { id: 'material:two', label: 'Two' }]
    const attached = attachActiveRevision(materials, revisions, { ofField: 'of_material' })
    const one = attached.find((m) => m.id === 'material:one')
    const two = attached.find((m) => m.id === 'material:two')
    expect(one.latest_revision_id).toBe('rev3')
    expect(one.latest_revision?.id).toBe('rev3')
    expect(two.latest_revision_id).toBeUndefined()
  })

  it('works for features via of_feature field', () => {
    const featureRevs = [
      { id: 'featrev1', of_feature: 'feature:ros', status: 'active', revision: 1, created_at: '2025-01-01' },
      { id: 'featrev2', of_feature: 'feature:ros', status: 'active', revision: 2, created_at: '2025-01-02' }
    ]
    const latest = resolveActiveRevision(featureRevs, 'feature:ros', { ofField: 'of_feature' })
    expect(latest?.id).toBe('featrev2')
  })
})
