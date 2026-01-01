#!/usr/bin/env node

import path from 'path'
import { loadPlateEventsFromRecord, toPyLabRobotCommands } from './lib/plateEventConverter.mjs'

async function main() {
  const targetPath = process.argv[2]
  if (!targetPath) {
    console.error('Usage: node scripts/adapters/plate-events-to-pylabrobot.mjs <plate-layout.yaml>')
    process.exit(1)
  }

  const resolved = path.resolve(process.cwd(), targetPath)
  const { events } = await loadPlateEventsFromRecord(resolved)
  if (!events.length) {
    console.warn('[pylabrobot] No PlateEvents found in record.')
  }
  const commands = toPyLabRobotCommands(events)
  console.log(JSON.stringify({ commands }, null, 2))
}

main().catch((err) => {
  console.error('[pylabrobot] Failed to convert PlateEvents:', err)
  process.exitCode = 1
})
