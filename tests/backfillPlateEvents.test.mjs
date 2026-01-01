#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { mkdtempSync, rmSync, copyFileSync } from 'fs'
import os from 'os'
import assert from 'node:assert/strict'
import { parseFrontMatter } from '../src/records/frontMatter.js'
import { backfillFile } from '../scripts/migrations/lib/backfillPlateEvents.mjs'
import { readFileSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTempLayout() {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'plate-backfill-'))
  const source = path.join(__dirname, 'fixtures/plate-layouts/sample-layout.yaml')
  const target = path.join(tmpDir, 'sample-layout.yaml')
  copyFileSync(source, target)
  return { tmpDir, target }
}

function cleanupTemp(dir) {
  rmSync(dir, { recursive: true, force: true })
}

async function main() {
  const { tmpDir, target } = createTempLayout()
  try {
    const result = await backfillFile(target)
    assert(result.changed, 'Expected backfill to mutate the layout.')
    const updated = readFileSync(target, 'utf8')
    const { data } = parseFrontMatter(updated)
    const events = data?.data?.operations?.events || []
    assert(events.length === 1, 'Expected exactly one event generated from wells.')
    assert.strictEqual(events[0].event_type, 'transfer', 'Generated event should be a transfer.')
    assert.strictEqual(events[0].details?.target?.wells?.A01?.material_id, 'material:cmpd_a')
    console.log('[backfillPlateEvents] migration checks passed.')
  } finally {
    cleanupTemp(tmpDir)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
