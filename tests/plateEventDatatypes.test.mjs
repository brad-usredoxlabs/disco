#!/usr/bin/env node

import assert from 'node:assert/strict'
import { loadSchemaBundle } from '../scripts/lib/loadSchemaBundle.mjs'

async function main() {
  const bundle = await loadSchemaBundle('computable-lab')
  const schemas = bundle.recordSchemas || {}

  const labwareRef = schemas['labware-ref']
  const materialInWell = schemas['material-in-well']
  const materialRef = schemas['material-ref']
  const transferDetails = schemas['plate-event.transfer']
  const incubateDetails = schemas['plate-event.incubate']

  assert(labwareRef, 'Expected labware-ref schema to be registered in the bundle.')
  assert(materialInWell, 'Expected material-in-well schema to be registered in the bundle.')
  assert(materialRef, 'Expected material-ref schema to remain available.')
  assert(transferDetails, 'Expected plate-event.transfer schema to be registered in the bundle.')
  assert(incubateDetails, 'Expected plate-event.incubate schema to be registered in the bundle.')

  const labwareRequired = labwareRef.required || []
  assert(labwareRequired.includes('@id'), 'labware-ref must require "@id".')
  assert(labwareRequired.includes('kind'), 'labware-ref must require "kind".')

  const kindEnum = labwareRef?.properties?.kind?.enum || []
  const expectedKinds = ['plate', 'reservoir', 'tube_rack', 'tip_rack', 'trash', 'other']
  expectedKinds.forEach((kind) => {
    assert(kindEnum.includes(kind), `labware-ref kind enum missing "${kind}".`)
  })

  const materialInWellRequired = materialInWell.required || []
  assert(materialInWellRequired.includes('material'), 'material-in-well must require "material".')
  const materialRefPointer = materialInWell?.properties?.material?.$ref
  assert.strictEqual(
    materialRefPointer,
    './material-ref.schema.yaml',
    'material-in-well.material must $ref ./material-ref.schema.yaml'
  )

  const transferRequired = transferDetails.required || []
  ;['type', 'source', 'target', 'volume'].forEach((field) => {
    assert(transferRequired.includes(field), `transfer schema must require "${field}".`)
  })
  assert.strictEqual(
    transferDetails?.properties?.type?.const,
    'transfer',
    'transfer schema must enforce const "transfer".'
  )
  assert.strictEqual(transferDetails.additionalProperties, false, 'transfer schema must disallow extra fields.')

  const incubateRequired = incubateDetails.required || []
  ;['type', 'labware', 'duration'].forEach((field) => {
    assert(incubateRequired.includes(field), `incubate schema must require "${field}".`)
  })
  assert.strictEqual(
    incubateDetails?.properties?.type?.const,
    'incubate',
    'incubate schema must enforce const "incubate".'
  )
  assert.strictEqual(incubateDetails.additionalProperties, false, 'incubate schema must disallow extra fields.')

  console.log('[plateEventDatatypes] schema registration checks passed.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
