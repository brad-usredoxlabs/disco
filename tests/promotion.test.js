import { expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { parseFrontMatter, serializeFrontMatter } from '../src/records/frontMatter.js'
import { buildZodSchema } from '../src/records/zodBuilder.js'
import YAML from 'yaml'
import path from 'node:path'

import { promoteEvents } from '../src/app/promotionUtils.js'

const SCHEMA_ROOT = path.join(process.cwd(), 'schema', 'computable-lab')

async function loadProtocolSchema() {
  const raw = await readFile(path.join(SCHEMA_ROOT, 'protocol.schema.yaml'), 'utf-8')
  const parsed = YAML.parse(raw)
  return parsed
}

async function loadManifestSchemas() {
  const manifestRaw = await readFile(path.join(SCHEMA_ROOT, 'manifest.yaml'), 'utf-8')
  const manifest = YAML.parse(manifestRaw) || {}
  const recordSchemas = {}
  for (const entry of manifest.recordSchemas || []) {
    const fullPath = path.join(SCHEMA_ROOT, entry)
    const raw = await readFile(fullPath, 'utf-8')
    const parsed = YAML.parse(raw)
    if (parsed) {
      const key = path.basename(entry).replace('.schema.yaml', '').replace('.yaml', '')
      recordSchemas[key] = parsed
    }
  }
  return recordSchemas
}

test('promotion produces schema-valid protocol from fixture run', async () => {
  const fixturePath = path.join(process.cwd(), 'tmp/fixtures/run-promotion-fixture.yaml')
  const runRaw = await readFile(fixturePath, 'utf-8')
  const { data: frontmatter } = parseFrontMatter(runRaw)
  const events = frontmatter?.data?.activities?.[0]?.plate_events || []
  expect(events.length).toBeGreaterThan(0)

  const labwareMap = { media_reservoir: 'labware:res1', cell_plate: 'plate/PLT-PROMO' }
  const promoted = promoteEvents(events, labwareMap, 'transfer_volume')
  const frontmatterOut = {
    metadata: {
      kind: 'protocol',
      title: 'Promoted protocol'
    },
    data: {
      operations: {
        family: 'promo',
        version: '0.1.0',
        parametersSchema: {},
        labwareRoles: {
          media_reservoir: { plate_type: 'plate96' },
          cell_plate: { plate_type: 'plate96' }
        },
        events: promoted
      }
    }
  }

  const recordSchemas = await loadManifestSchemas()
  const protocolSchema = await loadProtocolSchema()
  const zodSchema = buildZodSchema(protocolSchema, { schemas: recordSchemas })
  const payload = {
    kind: 'protocol',
    id: 'PROTO-PROMO',
    state: 'draft',
    recordId: 'PROTO-PROMO',
    ...(frontmatterOut.metadata || {}),
    ...(frontmatterOut.data?.operations || {})
  }
  const result = zodSchema.safeParse(payload)
  if (!result.success) {
    console.error(result.error.issues)
  }
  expect(result.success).toBe(true)
  // ensure volume was parameterized
  expect(promoted[0].details.volume).toBe('${transfer_volume}')
})
