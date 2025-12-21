#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { backfillFile, discoverPlateLayouts } from './lib/backfillPlateEvents.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const targets = args.filter((arg) => !arg.startsWith('--'))
  const files = targets.length ? targets : await discoverPlateLayouts(projectRoot)

  if (!files.length) {
    console.log('[plate-events] No plate layouts found.')
    return
  }

  let changed = 0
  for (const file of files) {
    const result = await backfillFile(path.resolve(file), { dryRun })
    if (result.changed) {
      changed++
      console.log(`[plate-events] ${dryRun ? 'Would update' : 'Updated'} ${file}`)
    }
  }

  console.log(`[plate-events] ${dryRun ? 'Evaluated' : 'Backfilled'} ${changed} file(s).`)
}

main().catch((err) => {
  console.error('[plate-events] Migration failed:', err)
  process.exitCode = 1
})
