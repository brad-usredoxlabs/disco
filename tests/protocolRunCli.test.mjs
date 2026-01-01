#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import assert from 'node:assert/strict'
import { execa } from 'execa'
import { parseFrontMatter } from '../src/records/frontMatter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const tmpDir = await fs.mkdtemp('protocol-run-')
  try {
    const configPath = path.join(tmpDir, 'config.json')
    const protocolPath = path.resolve(__dirname, 'fixtures/protocols/sample-protocol.yaml')
    const outputRunPath = path.join(tmpDir, 'RUN-TEST.yaml')
    const config = {
      protocolPath,
      runId: 'RUN-CLI-TEST',
      outputRunPath,
      parameters: {
        seed_volume: '120 uL',
        incubation_time: '25 min'
      },
      labware: {
        cell_plate: 'plate/PLT-CLI',
        media_reservoir: 'reservoir/CLI-MEDIA'
      }
    }
    await fs.writeFile(configPath, JSON.stringify(config), 'utf8')
    await execa('node', ['scripts/protocols/run-protocol.mjs', configPath], { cwd: path.resolve(__dirname, '..') })
    const raw = await fs.readFile(outputRunPath, 'utf8')
    const { data } = parseFrontMatter(raw)
    const activities = data?.data?.activities || []
    assert(activities.length, 'Expected run CLI to create activities.')
    assert.strictEqual(activities[0].plate_events?.[0]?.details?.volume, '120 uL')
    console.log('[protocolRunCli] CLI run generation passed.')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
