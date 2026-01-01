#!/usr/bin/env node

/**
 * Promote a Run record into a Protocol template:
 * - Collects PlateEvents from run activities (plate_events) or legacy data.operations.events
 * - Strips timestamps/run/labware refs, replacing with labware roles (from --labware role=labwareId)
 * - Keeps mapping and mapping_spec; parameterizes volume if --volume-param is provided
 * - Writes a protocol YAML record to --out (default 06_PROTOCOLS/<runId>_PROMOTED.yaml)
 *
 * Usage:
 *   node scripts/promote-run-to-protocol.mjs --run 08_RUNS/RUN-001.yaml --labware cell_plate=plate/PLT-1 --labware media_reservoir=labware:res1 --family my_protocol --version 0.1.0 --volume-param transfer_volume
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseFrontMatter, serializeFrontMatter } from '../src/records/frontMatter.js'
import { promoteEvents, buildProtocolFrontmatter } from '../src/app/promotionUtils.js'

function parseArgs(argv) {
  const args = { labware: {} }
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--run') args.run = argv[++i]
    else if (arg === '--out') args.out = argv[++i]
    else if (arg === '--family') args.family = argv[++i]
    else if (arg === '--version') args.version = argv[++i]
    else if (arg === '--title') args.title = argv[++i]
    else if (arg === '--volume-param') args.volumeParam = argv[++i]
    else if (arg === '--labware') {
      const pair = argv[++i]
      const [role, id] = (pair || '').split('=')
      if (role && id) args.labware[role] = id
    }
  }
  return args
}

function error(msg) {
  console.error(`[promote] ${msg}`)
  process.exit(1)
}

async function loadRun(runPath) {
  const raw = await fs.readFile(runPath, 'utf-8')
  const { data, body } = parseFrontMatter(raw)
  return { data, body }
}

function collectEvents(runData) {
  const ops = runData?.operations || {}
  const events = []
  const activities = runData?.activities || ops.activities || []
  activities.forEach((act) => {
    if (Array.isArray(act?.plate_events)) {
      events.push(...act.plate_events)
    }
  })
  if (!events.length && Array.isArray(ops.events)) {
    events.push(...ops.events)
  }
  return events
}

function mappingFromTarget(target = {}) {
  if (!target?.wells || typeof target.wells !== 'object') return []
  return Object.keys(target.wells).map((well) => ({
    source_well: well,
    target_well: well
  }))
}

function promoteEvents(events = [], labwareMap = {}, volumeParam = null) {
  return events
    .filter((evt) => evt && evt.event_type)
    .map((evt) => {
      if (evt.event_type !== 'transfer') {
        return {
          event_type: evt.event_type,
          label: evt.label || evt.event_type,
          notes: evt.notes || '',
          details: { ...evt.details, timestamp: undefined }
        }
      }
      const details = evt.details || {}
      const sourceRole = resolveRole(details.source?.labware, labwareMap, details.source_role)
      const targetRole = resolveRole(details.target?.labware, labwareMap, details.target_role)
      const mapping = Array.isArray(details.mapping) && details.mapping.length ? details.mapping : mappingFromTarget(details.target)
      return {
        event_type: 'transfer',
        label: evt.label || 'Transfer',
        notes: evt.notes || '',
        details: {
          type: 'transfer',
          source_role: sourceRole || 'source_role',
          target_role: targetRole || 'target_role',
          mapping,
          mapping_spec: details.mapping_spec || null,
          volume: volumeParam ? `\${${volumeParam}}` : details.volume || ''
        }
      }
    })
}

function resolveRole(labwareRef, map, fallbackRole) {
  const id = labwareRef?.['@id'] || labwareRef
  const entry = Object.entries(map).find(([_role, labId]) => labId === id)
  if (entry) return entry[0]
  return fallbackRole || ''
}

function buildProtocolFrontmatter(runData, promotedEvents, args) {
  const family = args.family || runData?.operations?.family || ''
  const version = args.version || runData?.operations?.version || '0.1.0'
  const title = args.title || runData?.title || runData?.metadata?.title || 'Promoted protocol'
  const labwareRoles = Object.entries(args.labware).reduce((acc, [role]) => {
    acc[role] = { plate_type: 'plate96' }
    return acc
  }, {})
  return {
    metadata: {
      recordType: 'protocol',
      title
    },
    data: {
      operations: {
        family,
        version,
        parametersSchema: {},
        labwareRoles,
        events: promotedEvents
      }
    }
  }
}

async function writeProtocol(outPath, frontmatter, body = '') {
  const serialized = serializeFrontMatter(frontmatter, body)
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, serialized, 'utf-8')
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.run) error('Missing --run <path>')
  const run = await loadRun(args.run)
  const events = collectEvents(run.data)
  if (!events.length) error('No events found in run.')
  const promoted = promoteEvents(events, args.labware, args.volumeParam)
  const frontmatter = buildProtocolFrontmatter(run.data, promoted, {
    family: args.family,
    version: args.version,
    title: args.title,
    labware: args.labware
  })
  const out =
    args.out ||
    path.join(
      process.cwd(),
      '06_PROTOCOLS',
      `${path.basename(args.run, path.extname(args.run))}_PROMOTED.yaml`
    )
  await writeProtocol(out, frontmatter, '# Promoted protocol\n\nGenerated from run promotion script.')
  console.log(`[promote] Wrote protocol to ${out}`)
}

main().catch((err) => {
  console.error('[promote] Failed:', err)
  process.exit(1)
})
