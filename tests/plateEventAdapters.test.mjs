#!/usr/bin/env node

import assert from 'node:assert/strict'
import { toPyLabRobotCommands, toPyalabSteps, normalizePlateEvents } from '../scripts/adapters/lib/plateEventConverter.mjs'

const structuredEvents = normalizePlateEvents([
  {
    event_type: 'transfer',
    timestamp: '2025-01-01T12:00:00Z',
    run: 'run/RUN-0001',
    labware: [
      {
        '@id': 'plate/PLT-0001',
        kind: 'plate',
        label: 'Assay plate'
      }
    ],
    details: {
      type: 'transfer',
      volume: '5 uL',
      source: {
        labware: {
          '@id': 'reservoir/MEDIA',
          kind: 'reservoir',
          label: 'Media source'
        },
        wells: {
          R1: {
            material: { label: 'Media' },
            role: 'prepared_mix',
            volume: '5 uL'
          }
        }
      },
      target: {
        labware: {
          '@id': 'plate/PLT-0001',
          kind: 'plate',
          label: 'Assay plate'
        },
        wells: {
          A01: {
            well: 'A01',
            role: 'treatment',
            material_id: 'material:media',
            volume: '5 uL'
          }
        }
      },
      material: {
        label: 'Media',
        kind: 'prepared_mix'
      },
      pipetting_hint: {
        mode: 'single',
        channels: 1
      }
    }
  },
  {
    kind: 'legacy',
    wells: ['A01'],
    timestamp: '2025-01-01T12:05:00Z',
    payload: {
      notes: 'Legacy note'
    }
  }
])

function main() {
  const commands = toPyLabRobotCommands(structuredEvents)
  assert.strictEqual(commands.length, 2)
  assert.strictEqual(commands[0].command, 'transfer')
  assert.strictEqual(commands[0].fromPlate, 'reservoir/MEDIA')
  assert.deepStrictEqual(commands[0].toWells, ['A01'])

  // Legacy event should normalize to "other"
  assert.strictEqual(commands[1].command, 'other')

  const steps = toPyalabSteps(structuredEvents)
  assert.strictEqual(steps.length, 2)
  assert(steps[0].includes('Transfer'))
  assert(steps[1].includes('Custom event'))
  console.log('[plateEventAdapters] conversion checks passed.')
}

main()
