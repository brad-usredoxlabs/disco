import { describe, it, expect } from 'vitest'
import { useRunEditorStore } from '../src/run-editor/useRunEditorStore.js'

describe('material revision propagation', () => {
  it('persists material_revision into plate events with cached label/status', () => {
    const store = useRunEditorStore()
    store.initialize({ run: { data: { activities: [] } }, layout: {} })
    store.applyMaterialUse({
      wells: ['A1'],
      material: 'material:test',
      material_revision: 'materialrev:test@20250101T000000',
      role: 'component',
      volume: { value: 1, unit: 'uL' },
      targetLabware: { '@id': 'plate1' }
    })
    const activity = store.state.run.data.activities[0]
    const evt = activity.plate_events[0]
    expect(evt.details.material_id).toBe('material:test')
    expect(evt.details.material_revision).toBe('materialrev:test@20250101T000000')
    expect(evt.details.material_revision_label).toBe('materialrev:test@20250101T000000')
    expect(evt.details.material_revision_status).toBe('active')
  })
})
