#!/usr/bin/env node

import path from 'path'
import { loadPlateEventsFromRecord, toPyalabSteps } from './lib/plateEventConverter.mjs'

async function main() {
  const targetPath = process.argv[2]
  if (!targetPath) {
    console.error('Usage: node scripts/adapters/plate-events-to-pyalab.mjs <plate-layout.yaml>')
    process.exit(1)
  }

  const resolved = path.resolve(process.cwd(), targetPath)
  const { events } = await loadPlateEventsFromRecord(resolved)
  if (!events.length) {
    console.warn('[pyalab] No PlateEvents found in record.')
  }
  const steps = toPyalabSteps(events)
  steps.forEach((line) => console.log(line))
}

main().catch((err) => {
  console.error('[pyalab] Failed to convert PlateEvents:', err)
  process.exitCode = 1
})
