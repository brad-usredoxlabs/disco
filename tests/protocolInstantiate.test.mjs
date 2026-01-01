#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import assert from 'node:assert/strict'
import { parseFrontMatter } from '../src/records/frontMatter.js'
import { instantiateProtocol, buildProtocolSegmentActivity } from '../src/protocols/instantiateProtocol.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadFixture(name) {
  const filePath = path.join(__dirname, 'fixtures/protocols', name)
  const raw = readFileSync(filePath, 'utf8')
  return parseFrontMatter(raw)
}

function main() {
  const { data } = loadFixture('sample-protocol.yaml')
  const events = instantiateProtocol(data, {
    runId: 'RUN-TEST',
    parameters: {
      seed_volume: '100 uL',
      incubation_time: '30 min'
    },
    labware: {
      cell_plate: 'plate/PLT-0001',
      media_reservoir: 'reservoir/MEDIA-0001'
    }
  })

  assert.strictEqual(events.length, 2, 'Expected two instantiated events.')
  const transfer = events[0]
  assert.strictEqual(transfer.event_type, 'transfer')
  assert.strictEqual(transfer.details.volume, '100 uL')
  assert.strictEqual(Object.keys(transfer.details.target.wells).length, 2)
  const incubate = events[1]
  assert.strictEqual(incubate.details.duration, '30 min')
  const activity = buildProtocolSegmentActivity(data, {
    runId: 'RUN-TEST',
    parameters: {
      seed_volume: '100 uL',
      incubation_time: '30 min'
    },
    labware: {
      cell_plate: 'plate/PLT-0100'
    }
  })
  assert.strictEqual(activity.kind, 'protocol_segment')
  assert.strictEqual(activity.plate_events.length, 2)
  console.log('[protocolInstantiate] protocol → PlateEvent instantiation passed.')
}

main()
