#!/usr/bin/env node

import path from 'path'
import { promises as fs } from 'fs'
import { parseFrontMatter, serializeFrontMatter } from '../../src/records/frontMatter.js'
import { buildProtocolSegmentActivity } from '../../src/protocols/instantiateProtocol.js'

async function main() {
  const configPath = process.argv[2]
  if (!configPath) {
    console.error('Usage: node scripts/protocols/run-protocol.mjs <config.json>')
    process.exit(1)
  }

  const config = JSON.parse(await fs.readFile(path.resolve(configPath), 'utf8'))
  const protocolPath = path.resolve(config.protocolPath)
  const outputPath = path.resolve(config.outputRunPath || `runs/${config.runId || 'RUN-UNKNOWN'}.yaml`)
  const protocolRaw = await fs.readFile(protocolPath, 'utf8')
  const { data: protocolFrontMatter } = parseFrontMatter(protocolRaw)

  config.runTitle ||= protocolFrontMatter?.metadata?.title || 'Protocol run'

  const activity = buildProtocolSegmentActivity(protocolFrontMatter, {
    parameters: config.parameters || {},
    labware: config.labware || {},
    runId: config.runId || '',
    timestamp: config.timestamp,
    activityId: config.activityId,
    label: config.segmentLabel
  })

  const runFrontMatter = await buildOrUpdateRunFrontMatter(config, activity)
  const body = buildRunBody(runFrontMatter, config)
  const serialized = serializeFrontMatter(runFrontMatter, body)
  await fs.writeFile(outputPath, serialized, 'utf8')
  console.log(
    `[protocol] Run ${runFrontMatter.metadata.id} updated (${activity.plate_events.length} PlateEvents) -> ${outputPath}`
  )
}

async function buildOrUpdateRunFrontMatter(config, activity) {
  const outputPath = path.resolve(config.outputRunPath || `runs/${config.runId || 'RUN-UNKNOWN'}.yaml`)
  if (await fileExists(outputPath)) {
    const runRaw = await fs.readFile(outputPath, 'utf8')
    const { data: existingFrontMatter } = parseFrontMatter(runRaw)
    return appendActivityToRun(existingFrontMatter || {}, activity, config)
  }
  return buildRunFrontMatter(config, activity)
}

function buildRunBody(frontMatter, config = {}) {
  if (config.appendBody === false) return ''
  const title = frontMatter?.metadata?.title || frontMatter?.metadata?.id || 'Run'
  return `# ${title}\n`
}

function buildRunFrontMatter(config, activity) {
  const metadata = {
    recordType: 'run',
    state: config.runState || 'draft',
    id: config.runId || new Date().toISOString(),
    title: config.runTitle || 'Protocol run',
    experimentId: config.experimentId || '',
    runId: config.runId || '',
    createdAt: new Date().toISOString()
  }

  return {
    metadata,
    data: {
      labware_bindings: config.labware || {},
      parameters: config.parameters || {},
      activities: [activity]
    }
  }
}

function appendActivityToRun(frontMatter = {}, activity, config = {}) {
  const metadata = clone(frontMatter.metadata || {})
  metadata.recordType ||= 'run'
  metadata.id ||= config.runId || metadata.recordId || `RUN-${Date.now()}`
  metadata.runId ||= config.runId || metadata.id
  metadata.title ||= config.runTitle || activity?.label || metadata.id
  metadata.updatedAt = new Date().toISOString()

  const dataSection = clone(frontMatter.data || {})
  const activities = Array.isArray(dataSection.activities) ? [...dataSection.activities] : []
  activities.push(activity)
  dataSection.activities = activities
  dataSection.labware_bindings = mergeObjects(dataSection.labware_bindings, config.labware)
  dataSection.parameters = mergeObjects(dataSection.parameters, config.parameters)

  return {
    metadata,
    data: dataSection
  }
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

function mergeObjects(base = {}, overrides = {}) {
  const result = { ...(base || {}) }
  Object.entries(overrides || {}).forEach(([key, value]) => {
    result[key] = value
  })
  return Object.keys(result).length ? result : undefined
}

function clone(value) {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((entry) => clone(entry))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, clone(val)]))
  }
  return value
}

main().catch((err) => {
  console.error('[protocol] Failed to run protocol:', err)
  process.exitCode = 1
})
