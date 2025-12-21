#!/usr/bin/env node

import assert from 'node:assert/strict'
import { deriveWellsFromEvents } from '../src/plate-editor/utils/plateEventDeriver.js'

function buildTransferEvent() {
  return {
    id: 'evt-1',
    event_type: 'transfer',
    timestamp: '2025-01-01T00:00:00Z',
    run: 'run/RUN-001',
    labware: [
      {
        '@id': 'plate/PLT-0001',
        kind: 'plate',
        label: 'Test plate'
      }
    ],
    details: {
      type: 'transfer',
      source: {
        labware: {
          '@id': 'material/material:sample_a',
          kind: 'reservoir',
          label: 'Sample A'
        },
        wells: {
          A01: {
            material: { label: 'Sample A' },
            role: 'treatment',
            volume: '10 uL'
          }
        }
      },
      target: {
        labware: {
          '@id': 'plate/PLT-0001',
          kind: 'plate',
          label: 'Test plate'
        },
        wells: {
          A01: {
            well: 'A01',
            role: 'treatment',
            material_id: 'material:sample_a',
            notes: '',
            volume: '10 uL'
          }
        }
      },
      volume: '10 uL',
      material: {
        label: 'Sample A',
        kind: 'treatment'
      }
    }
  }
}

function buildMappingTransferEvent() {
  return {
    id: 'evt-mapping',
    event_type: 'transfer',
    timestamp: '2025-01-02T00:00:00Z',
    run: 'run/RUN-002',
    labware: [],
    details: {
      type: 'transfer',
      source_role: 'media_reservoir',
      target_role: 'cell_plate',
      mapping: [
        { source_well: 'SRC1', target_well: 'B01' },
        { source_well: 'SRC1', target_well: 'B02' }
      ],
      volume: '5 uL',
      material: {
        id: 'material:media',
        label: 'Media'
      }
    }
  }
}

function buildWashEvent() {
  return {
    id: 'evt-2',
    event_type: 'wash',
    timestamp: '2025-01-01T01:00:00Z',
    run: 'run/RUN-001',
    labware: [
      {
        '@id': 'plate/PLT-0001',
        kind: 'plate',
        label: 'Test plate'
      }
    ],
    details: {
      type: 'wash',
      labware: {
        '@id': 'plate/PLT-0001',
        kind: 'plate',
        label: 'Test plate'
      },
      wells: ['A01'],
      buffer: {
        label: 'material:sample_a',
        kind: 'wash_buffer'
      },
      cycles: 1
    }
  }
}

function main() {
  const events = [buildTransferEvent()]
  const derived = deriveWellsFromEvents(events, {
    materialsByLabel: { 'Sample A': 'material:sample_a' }
  })
  assert(derived.A01, 'Expected derived wells to include A01.')
  assert.strictEqual(derived.A01.inputs.length, 1, 'Expected a single material entry.')
  assert.strictEqual(derived.A01.inputs[0].material.id, 'material:sample_a')
  assert.strictEqual(derived.A01.inputs[0].role, 'treatment')

  const washed = deriveWellsFromEvents([...events, buildWashEvent()], {
    materialsByLabel: { 'Sample A': 'material:sample_a' }
  })
  assert(!washed.A01, 'Wash event should remove material from A01.')

  const mappingEvents = [buildMappingTransferEvent()]
  const derivedFromMapping = deriveWellsFromEvents(mappingEvents)
  assert(derivedFromMapping.B01, 'Mapping transfer should populate target well B01.')
  assert(derivedFromMapping.B02, 'Mapping transfer should populate target well B02.')
  assert.strictEqual(
    derivedFromMapping.B01.inputs[0].material.id,
    'material:media',
    'Mapping transfer should carry material id'
  )
  assert.strictEqual(derivedFromMapping.B01.inputs[0].amount.value, 5, 'Mapping volume should be parsed')
  assert.strictEqual(derivedFromMapping.B01.inputs[0].amount.unit, 'uL', 'Mapping volume unit should be parsed')

  console.log('[plateEventDeriver] derivation checks passed.')
}

main()
