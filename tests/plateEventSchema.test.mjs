#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { loadSchemaBundle } from '../scripts/lib/loadSchemaBundle.mjs'
import { buildZodSchema } from '../src/records/zodBuilder.js'

async function loadFixture(name) {
  const url = new URL(`./fixtures/plate-events/${name}`, import.meta.url)
  const text = await readFile(url, 'utf8')
  return JSON.parse(text)
}

async function main() {
  const bundle = await loadSchemaBundle('computable-lab')
  const schemaNode = bundle.recordSchemas['plate-event']
  if (!schemaNode) {
    throw new Error('plate-event schema missing from bundle.')
  }

  const zodSchema = buildZodSchema(schemaNode, { schemas: bundle.recordSchemas })
  const validFixture = await loadFixture('transfer-min.json')
  const result = zodSchema.safeParse(validFixture)
  if (!result.success) {
    console.error(result.error)
    throw new Error('Expected transfer-min fixture to pass PlateEvent validation.')
  }

  const missingType = { ...validFixture }
  delete missingType.event_type
  const missingTypeResult = zodSchema.safeParse(missingType)
  if (missingTypeResult.success) {
    throw new Error('Expected PlateEvent without event_type to fail validation.')
  }

  const missingVolume = JSON.parse(JSON.stringify(validFixture))
  delete missingVolume.details.volume
  const missingVolumeResult = zodSchema.safeParse(missingVolume)
  if (missingVolumeResult.success) {
    throw new Error('Expected PlateEvent transfer without volume to fail validation.')
  }

  console.log('[plateEventSchema] PlateEvent schema validation passed.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
