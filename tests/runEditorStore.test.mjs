import { describe, it, expect } from 'vitest'
import { useRunEditorStore } from '../src/run-editor/useRunEditorStore.js'

function buildTransfer({ targetLabware, wellId, ts }) {
  return {
    id: `evt-${wellId}`,
    event_type: 'transfer',
    timestamp: ts,
    labware: [
      { '@id': 'labware:RES', kind: 'reservoir' },
      { '@id': targetLabware, kind: 'plate' }
    ],
    details: {
      type: 'transfer',
      source: {
        labware: { '@id': 'labware:RES', kind: 'reservoir' },
        wells: { SRC1: {} }
      },
      target: {
        labware: { '@id': targetLabware, kind: 'plate' },
        wells: { [wellId]: { well: wellId, volume: '50 uL' } }
      },
      mapping: [{ source_well: 'SRC1', target_well: wellId, volume: '50 uL' }],
      volume: '50 uL',
      material: { id: 'material:drug' }
    }
  }
}

describe('useRunEditorStore multi-labware replay', () => {
  const run = {
    metadata: {
      recordId: 'RUN-TEST',
      title: 'Run Test'
    },
    data: {
      labware_bindings: {
        reservoir: 'labware:RES',
        plate_a: 'plate/PLATE-A',
        plate_b: 'plate/PLATE-B'
      },
      activities: [
        {
          id: 'seg-1',
          kind: 'protocol_segment',
          label: 'Segment 1',
          plate_events: [
            buildTransfer({ targetLabware: 'plate/PLATE-A', wellId: 'A01', ts: '2025-01-01T00:00:00Z' }),
            buildTransfer({ targetLabware: 'plate/PLATE-B', wellId: 'B02', ts: '2025-01-01T00:10:00Z' })
          ]
        }
      ]
    }
  }

  it('replays wells for the selected labware only', () => {
    const store = useRunEditorStore()
    store.initialize({ run })

    store.setActiveLabwareId('plate/PLATE-A')
    store.setCursor('2025-01-01T00:00:00Z')
    const wellsA = store.getDerivedWells('plate/PLATE-A')
    const wellsB = store.getDerivedWells('plate/PLATE-B')
    expect(wellsA['A01']).toBeDefined()
    expect(wellsB['B02']).toBeUndefined()

    store.setActiveLabwareId('plate/PLATE-B')
    store.setCursor('2025-01-01T00:10:00Z')
    const wellsB2 = store.getDerivedWells('plate/PLATE-B')
    const wellsA2 = store.getDerivedWells('plate/PLATE-A')
    expect(wellsB2['B02']).toBeDefined()
    expect(wellsA2['A01']).toBeDefined()
  })

  it('exposes labware options from bindings and events', () => {
    const store = useRunEditorStore()
    store.initialize({ run })
    const options = store.availableLabwareIds(run.data.activities[0].plate_events)
    expect(options).toEqual(expect.arrayContaining(['labware:RES', 'plate/PLATE-A', 'plate/PLATE-B']))
  })

  it('defaults active labware based on target role binding', () => {
    const store = useRunEditorStore()
    store.initialize({ run })
    // target role is unbound; bind it and ensure active labware switches
    store.state.run.data.labware_bindings.target = 'plate/PLATE-B'
    const id = store.resolveLabwareIdForRole('target')
    expect(id).toBe('plate/PLATE-B')
    store.setActiveLabwareId(store.resolveLabwareIdForRole('target'))
    expect(store.state.activeLabwareId).toBe('plate/PLATE-B')
  })

  it('sets nowTime to latest event and toggles isInspecting when cursor rewinds', () => {
    const store = useRunEditorStore()
    store.initialize({ run })
    expect(store.state.nowTime).toContain('2025-01-01T00:10:00')
    expect(store.state.cursor).toBe(store.state.nowTime)
    expect(store.isInspecting()).toBe(false)
    store.setCursor('2025-01-01T00:00:00Z')
    expect(store.isInspecting()).toBe(true)
    store.setCursor(store.state.nowTime)
    expect(store.isInspecting()).toBe(false)
  })

  it('replays same-timestamp events in insertion order', () => {
    const store = useRunEditorStore()
    const ts = '2025-01-02T00:00:00Z'
    store.initialize({
      run: {
        metadata: { recordId: 'RUN-ORDER' },
        data: {
          activities: [
            {
              id: 'seg-1',
              plate_events: [
                {
                  id: 'evt-add',
                  event_type: 'transfer',
                  timestamp: ts,
                  labware: [{ '@id': 'plate/PLATE-X', kind: 'plate' }],
                  details: {
                    type: 'transfer',
                    source: { labware: { '@id': 'labware:RES', kind: 'reservoir' }, wells: { SRC: {} } },
                    target: { labware: { '@id': 'plate/PLATE-X', kind: 'plate' }, wells: { A01: { well: 'A01', volume: '10 uL' } } },
                    mapping: [{ source_well: 'SRC', target_well: 'A01', volume: '10 uL' }],
                    volume: '10 uL',
                    material: { id: 'material:drug' }
                  }
                },
                {
                  id: 'evt-wash',
                  event_type: 'wash',
                  timestamp: ts,
                  labware: [{ '@id': 'plate/PLATE-X', kind: 'plate' }],
                  details: { type: 'wash', labware: { '@id': 'plate/PLATE-X', kind: 'plate' }, wells: ['A01'], buffer: { label: 'buf' }, cycles: 1 }
                }
              ]
            }
          ]
        }
      }
    })
    store.setActiveLabwareId('plate/PLATE-X')
    store.setCursor(ts)
    const wells = store.getDerivedWells('plate/PLATE-X')
    expect(wells['A01']).toBeDefined()
    expect(wells['A01'].inputs).toEqual([])
  })
})
