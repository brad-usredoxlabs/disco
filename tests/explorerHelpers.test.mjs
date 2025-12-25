import { expect, test } from 'vitest'
import { buildOverlay, extractWellsFromEvent } from '../src/explorer/helpers.js'

test('extract wells collects mapping and target wells', () => {
  const evt = {
    details: {
      target: { wells: { A01: {}, B01: {} } },
      mapping: [
        { source_well: 'SRC1', target_well: 'A01' },
        { source_well: 'SRC1', target_well: 'B01' }
      ]
    }
  }
  const wells = extractWellsFromEvent(evt)
  expect(wells).toContain('A01')
  expect(wells).toContain('B01')
  expect(wells).toContain('SRC1')
})

test('overlay includes volume and material labels', () => {
  const labwareState = {
    A01: { totalVolumeL: 100e-6, components: [{ materialId: 'material:cells', moles: 1e-9 }] },
    B01: { totalVolumeL: 0, components: [] }
  }
  const overlay = buildOverlay(labwareState, { mode: 'dominant' })
  expect(overlay.A01).toBeTruthy()
  expect(overlay.A01.label).toBe('material:cells')
  const volOverlay = buildOverlay(labwareState, { mode: 'volume' })
  expect(volOverlay.A01.label).toContain('uL')
})
