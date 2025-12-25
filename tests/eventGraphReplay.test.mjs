#!/usr/bin/env node

import assert from 'node:assert/strict'
import { parseVolumeToLiters, parseConcentrationToMolar } from '../src/event-graph/units.js'
import { replayPlateEvents, plateStateAtTime, wellCompositionAtTime } from '../src/event-graph/replay.js'

function testUnits() {
  assert.ok(Math.abs(parseVolumeToLiters('100 uL') - 100e-6) < 1e-12, '100 uL -> 1e-4 L')
  assert.ok(Math.abs(parseVolumeToLiters('1 mL') - 1e-3) < 1e-12, '1 mL -> 1e-3 L')
  assert.ok(Math.abs(parseConcentrationToMolar('10 mM') - 0.01) < 1e-12, '10 mM -> 0.01 M')
  assert.ok(parseConcentrationToMolar('1 mg/mL', { molarMass: 1000 }) > 0, 'mg/mL converts with molar mass')
}

function buildTransferEvents() {
  const event1 = {
    id: 'evt-1',
    event_type: 'transfer',
    timestamp: '2025-01-01T00:00:00Z',
    run: 'run/R1',
    labware: [{ '@id': 'labware:res1' }, { '@id': 'labware:plate1' }],
    details: {
      type: 'transfer',
      source: {
        labware: { '@id': 'labware:res1', kind: 'reservoir' },
        wells: { SRC1: {} }
      },
      target: {
        labware: { '@id': 'labware:plate1', kind: 'plate' },
        wells: {
          A01: {
            well: 'A01',
            material_id: 'material:a'
          }
        }
      },
      volume: '10 uL',
      material: {
        id: 'material:a',
        stock_concentration: '10 mM'
      }
    }
  }

  const event2 = {
    id: 'evt-2',
    event_type: 'transfer',
    timestamp: '2025-01-01T00:05:00Z',
    run: 'run/R1',
    labware: [{ '@id': 'labware:plate1' }, { '@id': 'labware:plate2' }],
    details: {
      type: 'transfer',
      source: {
        labware: { '@id': 'labware:plate1', kind: 'plate' },
        wells: { A01: {} }
      },
      target: {
        labware: { '@id': 'labware:plate2', kind: 'plate' },
        wells: {
          B01: {
            well: 'B01'
          }
        }
      },
      mapping: [
        { source_well: 'A01', target_well: 'B01' }
      ],
      volume: '5 uL'
    }
  }

  return [event1, event2]
}

function testReplay() {
  const events = buildTransferEvents()
  const { state } = replayPlateEvents(events)
  const plate1A01 = state['labware:plate1'].A01
  assert.ok(plate1A01.totalVolumeL > 0, 'Plate1 A01 has volume')
  assert.ok(plate1A01.components[0].moles > 0, 'Plate1 A01 has material moles')

  const plate2B01 = state['labware:plate2'].B01
  assert.ok(plate2B01.totalVolumeL > 0, 'Plate2 B01 has volume')
  assert.ok(plate2B01.components[0].moles > 0, 'Plate2 B01 received material')

  const beforeSecond = plateStateAtTime(events, '2025-01-01T00:00:30Z')
  assert.ok(beforeSecond['labware:plate2'] === undefined, 'Plate2 empty before second transfer')

  const wellAt = wellCompositionAtTime(events, '2025-01-01T00:06:00Z', 'labware:plate2', 'B01')
  assert.ok(wellAt && wellAt.totalVolumeL > 0, 'Well composition selector works')
}

function main() {
  testUnits()
  testReplay()
  console.log('[event-graph] replay/unit tests passed.')
}

main()
