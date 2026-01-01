import { expect, test } from 'vitest'
import { replayPlateEvents } from '../src/event-graph/replay.js'
import { parseFrontMatter } from '../src/records/frontMatter.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

test('acceptance scenario: qPCR well has mixed components and correct volume', async () => {
  const fixture = path.join(process.cwd(), 'tmp/fixtures/run-acceptance-e2e.yaml')
  const raw = await readFile(fixture, 'utf-8')
  const { data: fm } = parseFrontMatter(raw)
  const events = fm?.data?.activities?.flatMap((act) => act.plate_events || []) || []
  const { state } = replayPlateEvents(events)
  const qpcr = state['plate/QPCR-PLATE'] || {}
  const b01 = qpcr.B01
  expect(b01).toBeTruthy()
  expect(b01.totalVolumeL).toBeGreaterThan(45e-6)
  expect(b01.totalVolumeL).toBeLessThan(60e-6)
  const ids = (b01.components || []).map((c) => c.materialId)
  expect(ids).toContain('material:qpcr_mix')
})
