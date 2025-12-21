import path from 'path'
import { promises as fs } from 'fs'
import { parseFrontMatter, serializeFrontMatter } from '../../../../src/records/frontMatter.js'

export async function readPlateLayout(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return { raw, ...parseFrontMatter(raw) }
}

export async function writePlateLayout(filePath, frontMatter, body) {
  const serialized = serializeFrontMatter(frontMatter, body || '')
  await fs.writeFile(filePath, serialized, 'utf8')
}

export function needsBackfill(operations = {}) {
  const events = Array.isArray(operations.events) ? operations.events : []
  return !events.some((event) => event && event.event_type)
}

export function convertWellsToEvents(frontMatter = {}) {
  const metadata = frontMatter.metadata || {}
  const dataSections = frontMatter.data || {}
  const operations = dataSections.operations || {}
  if (!needsBackfill(operations)) {
    return { changed: false }
  }

  const wells = operations.wells || {}
  const events = []
  Object.entries(wells).forEach(([wellId, wellData]) => {
    if (!wellData || !Array.isArray(wellData.inputs)) return
    wellData.inputs.forEach((input) => {
      const event = buildTransferEvent(metadata, wellId, input)
      if (event) {
        events.push(event)
      }
    })
  })

  const normalizedOps = {
    ...operations,
    events
  }
  const nextData = {
    ...dataSections,
    operations: normalizedOps
  }
  return {
    changed: events.length > 0,
    metadata,
    data: nextData
  }
}

function buildTransferEvent(metadata = {}, wellId, input = {}) {
  if (!wellId || !input?.material?.id) return null
  const labware = resolvePlateLabwareRef(metadata)
  const volume = formatAmount(input.amount)
  return {
    id: `evt-${wellId}-${input.material.id}`,
    event_type: 'transfer',
    timestamp: metadata.updatedAt || metadata.createdAt || new Date().toISOString(),
    run: metadata.runId || '',
    labware: [labware],
    details: {
      type: 'transfer',
      volume,
      source: {
        labware: {
          '@id': `reservoir/${input.material.id}`,
          kind: 'reservoir',
          label: input.material.id
        },
        wells: {
          [input.material.id]: {
            material: { label: input.material.id },
            role: input.role || 'treatment',
            volume
          }
        }
      },
      target: {
        labware,
        wells: {
          [wellId]: {
            well: wellId,
            role: input.role || 'treatment',
            material_id: input.material.id,
            notes: input.notes || '',
            volume
          }
        }
      },
      material: {
        label: input.material.id,
        kind: input.role || 'treatment'
      }
    }
  }
}

function resolvePlateLabwareRef(metadata = {}) {
  const recordId = metadata.recordId || metadata.id || 'plate'
  return {
    '@id': `plate/${recordId}`,
    kind: 'plate',
    label: metadata.title || recordId
  }
}

function formatAmount(amount) {
  if (!amount) return ''
  if (typeof amount === 'string') return amount
  if (typeof amount === 'object' && amount.value !== undefined && amount.unit) {
    return `${amount.value} ${amount.unit}`
  }
  return ''
}

export async function backfillFile(filePath, { dryRun = false } = {}) {
  const { data: frontMatter, body } = await readPlateLayout(filePath)
  const result = convertWellsToEvents(frontMatter)
  if (!result.changed) {
    return { changed: false }
  }
  if (dryRun) {
    return { changed: true }
  }
  const nextFrontMatter = {
    ...frontMatter,
    data: result.data
  }
  await writePlateLayout(filePath, nextFrontMatter, body)
  return { changed: true }
}

export async function discoverPlateLayouts(rootDir) {
  const plateDir = path.join(rootDir, '09_PLATE_LAYOUTS')
  const entries = await safeReadDir(plateDir)
  const files = []
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.join(plateDir, entry.name))
    }
  }
  return files
}

async function safeReadDir(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}
