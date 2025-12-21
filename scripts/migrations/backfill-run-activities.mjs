#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import { parseFrontMatter, serializeFrontMatter } from '../../src/records/frontMatter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const targets = args.filter((arg) => !arg.startsWith('--'))
  const files = targets.length ? targets : await discoverRunFiles()

  let converted = 0
  for (const file of files) {
    const result = await backfillRunFile(file, { dryRun })
    if (result.changed) {
      converted++
      console.log(`[run-activities] ${dryRun ? 'Would convert' : 'Converted'} ${file}`)
    }
  }
  console.log(`[run-activities] ${dryRun ? 'Evaluated' : 'Updated'} ${converted} file(s).`)
}

async function discoverRunFiles() {
  const runDir = path.join(projectRoot, '08_RUNS')
  try {
    const entries = await fs.readdir(runDir, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => path.join(runDir, entry.name))
  } catch {
    return []
  }
}

async function backfillRunFile(filePath, { dryRun = false } = {}) {
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = parseFrontMatter(raw)
  const frontMatter = parsed.data || {}
  const operations = frontMatter?.data?.operations || {}
  const existingActivities = frontMatter?.data?.activities
  if (Array.isArray(existingActivities) && existingActivities.length) {
    return { changed: false }
  }
  const events = operations.events
  if (!Array.isArray(events) || !events.length) {
    return { changed: false }
  }
  const segment = {
    id: 'protocol-segment-legacy',
    kind: 'protocol_segment',
    label: operations.label || 'Legacy protocol segment',
    protocol: {
      '@id': frontMatter.metadata?.protocol?.['@id'] || ''
    },
    labware_bindings: operations.labwareBindings || operations.labware_bindings || {},
    parameters: operations.parameters || {},
    plate_events: events
  }
  const nextFrontMatter = {
    ...frontMatter,
    data: {
      ...(frontMatter.data || {}),
      labware_bindings: operations.labwareBindings || frontMatter.data?.labware_bindings || {},
      parameters: operations.parameters || frontMatter.data?.parameters || {},
      activities: [segment]
    }
  }
  // Remove legacy operations block
  delete nextFrontMatter.data.operations
  if (dryRun) {
    return { changed: true }
  }
  const serialized = serializeFrontMatter(nextFrontMatter, parsed.body || '')
  await fs.writeFile(filePath, serialized, 'utf8')
  return { changed: true }
}

main().catch((err) => {
  console.error('[run-activities] Migration failed:', err)
  process.exitCode = 1
})
