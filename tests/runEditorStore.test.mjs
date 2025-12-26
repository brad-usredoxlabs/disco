import { describe, it, expect, vi } from 'vitest'
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

  it('seeds source palette from labware_bindings with active set to first binding', () => {
    const store = useRunEditorStore()
    store.initialize({ run })
    expect(store.state.sourcePalette.length).toBeGreaterThanOrEqual(2)
    expect(store.state.activeSourceId).toBe('labware:RES')
    const entry = store.state.sourcePalette.find((e) => e.labwareId === 'labware:RES')
    expect(entry?.label).toBe('reservoir')
  })

  it('adds run-derived entry and replays wells from loader', async () => {
    const sourceRun = {
      data: {
        activities: [
          {
            id: 'seg-src',
            plate_events: [
              buildTransfer({ targetLabware: 'plate/SRC', wellId: 'A01', ts: '2025-02-01T00:00:00Z' })
            ]
          }
        ]
      }
    }
    const loadRunById = vi.fn(async () => sourceRun)
    const store = useRunEditorStore()
    store.initialize({ run, loadRunById })
    store.addRunDerivedPaletteEntry({
      runId: 'RUN-SRC',
      labwareId: 'plate/SRC',
      label: 'Source run plate'
    })
    await vi.waitFor(() => {
      expect(store.state.runDerivedWells['plate/SRC']).toBeDefined()
    })
    const wells = store.getDerivedWells('plate/SRC')
    expect(wells['A01']).toBeDefined()
  })

  it('builds layout indexes for template palette entries', () => {
    const store = useRunEditorStore()
    store.initialize({ run })
    const entry = store.addTemplatePaletteEntry({ kind: 'reservoir-8', label: 'Res strip' })
    expect(entry.layoutIndex).toBeDefined()
    expect(entry.layoutIndex.wells.length).toBe(8)
    expect(entry.layoutIndex.columns).toBe(1)
    const plate = store.addTemplatePaletteEntry({ kind: 'plate24', label: '24w' })
    expect(plate.layoutIndex.rows).toBe(4)
    expect(plate.layoutIndex.columns).toBe(6)
  })

  it('persists layoutRef for reservoirs so they rehydrate with the correct shape', () => {
    const store = useRunEditorStore()
    store.initialize({ run })
    store.addTemplatePaletteEntry({ kind: 'reservoir-1', label: 'Single well', labwareId: 'labware:RES-1' })
    store.addTemplatePaletteEntry({ kind: 'reservoir-8', label: 'Strip', labwareId: 'labware:RES-8' })
    const palette = store.derivePaletteData()
    const res1 = palette.find((p) => p.labwareId === 'labware:RES-1')
    const res8 = palette.find((p) => p.labwareId === 'labware:RES-8')
    expect(res1.layoutRef).toBe('template:reservoir-1')
    expect(res8.layoutRef).toBe('template:reservoir-8')

    const rehydrated = useRunEditorStore()
    rehydrated.initialize({
      run: {
        metadata: { recordId: 'RUN-RES' },
        data: { source_palette: palette }
      }
    })
    const hydratedRes1 = rehydrated.state.sourcePalette.find((p) => p.labwareId === 'labware:RES-1')
    const hydratedRes8 = rehydrated.state.sourcePalette.find((p) => p.labwareId === 'labware:RES-8')
    expect(hydratedRes1.layoutIndex?.wells?.length).toBe(1)
    expect(hydratedRes8.layoutIndex?.wells?.length).toBe(8)
    expect(hydratedRes8.layoutIndex?.columns).toBe(1)
  })

  it('persists source_palette from palette entries', () => {
    const store = useRunEditorStore()
    store.initialize({ run })
    store.addTemplatePaletteEntry({ kind: 'plate96', label: 'Plate A', labwareId: 'plate/A' })
    store.addRunDerivedPaletteEntry({
      runId: 'RUN-SRC',
      labwareId: 'plate/SRC',
      label: 'Source run plate',
      archived: true
    })
    const palette = store.derivePaletteData()
    expect(Array.isArray(palette)).toBe(true)
    expect(palette.find((e) => e.labwareId === 'plate/A')).toBeTruthy()
    expect(palette.find((e) => e.labwareId === 'plate/SRC')?.archived).toBe(true)
    expect(store.state.run.data.source_palette).toHaveLength(palette.length)
  })

  it('records run-derived status when loader fails', async () => {
    const loadRunById = vi.fn(async () => {
      throw new Error('boom')
    })
    const store = useRunEditorStore()
    store.initialize({ run, loadRunById })
    store.addRunDerivedPaletteEntry({
      runId: 'RUN-SRC',
      labwareId: 'plate/SRC',
      label: 'Bad run'
    })
    await vi.waitFor(() => {
      expect(store.state.runDerivedStatus['plate/SRC']?.loading).toBe(false)
    })
    expect(store.state.runDerivedStatus['plate/SRC']?.error).toBeTruthy()
  })

  it('sanitizes transfers to minimal shape (no mapping volumes, no empty material_id)', () => {
    const store = useRunEditorStore()
    const dirtyRun = {
      metadata: { recordId: 'RUN-MIN' },
      data: {
        activities: [
          {
            id: 'seg-1',
            plate_events: [
              {
                event_type: 'transfer',
                details: {
                  source_labware: 'labware:RES',
                  target_labware: 'plate/DEST',
                  volume: { value: 4, unit: 'uL' },
                  mapping: [{ source_well: 'A01', target_well: 'B02', volume: null }],
                  mapping_spec: { mode: 'fill' },
                  material_id: null
                }
              }
            ]
          }
        ]
      }
    }
    store.initialize({ run: dirtyRun })
    store.sanitizeTransfers()
    const evt = store.state.run.data.activities[0].plate_events[0]
    expect(evt.details.mapping[0].volume).toBeUndefined()
    expect(evt.details.volume).toEqual({ value: 4, unit: 'uL' })
    expect(evt.details.material_id).toBeUndefined()
    expect(evt.details.mapping_spec?.target_wells).toEqual(['B02'])
  })
})
