import { describe, it, expect } from 'vitest'
import { useRunEditorStore } from '../src/run-editor/useRunEditorStore.js'
import { replayPlateEvents } from '../src/event-graph/replay.js'

describe('RunEditor applyMaterialUse', () => {
  it('adds applied material to target wells (derived state)', () => {
    const store = useRunEditorStore()
    store.initialize({
      run: {
        metadata: {
          recordId: 'RUN-TEST',
          title: 'Test Run'
        },
        data: {
          labware_bindings: {
            treatment: 'plate/RUN-TEST'
          },
          activities: []
        }
      },
      layout: {
        kind: 'plate96'
      },
      materialLibrary: [{ id: 'MAT-1', label: 'Material 1' }]
    })

    store.applyMaterialUse({
      wells: ['B02'],
      material: 'MAT-1',
      role: 'treatment',
      amount: '2 uL',
      sourceLabware: 'treatment',
      targetLabware: 'treatment'
    })

    // Peek at raw replay state for debugging
    const rebuilt = replayPlateEvents(store.state.run.data.activities[0].plate_events, {})

    const derived = store.getDerivedWells('plate/RUN-TEST')
    expect(derived.B02.inputs?.[0]?.material?.id).toBe('MAT-1')
    expect(derived.B02.inputs?.[0]?.amount?.value).toBeCloseTo(2)
  })
})
