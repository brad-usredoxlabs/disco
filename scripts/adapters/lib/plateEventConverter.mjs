import { promises as fs } from 'fs'
import { parseFrontMatter } from '../../../src/records/frontMatter.js'

export async function loadPlateEventsFromRecord(filePath) {
  const source = await fs.readFile(filePath, 'utf8')
  const { data } = parseFrontMatter(source)
  const metadata = data?.metadata || {}
  const dataSections = data?.data || {}
  const operations = dataSections.operations || data.operations || {}
  const events = Array.isArray(operations.events) ? operations.events : []
  const normalized = normalizePlateEvents(events, {
    recordMetadata: metadata
  })
  return { events: normalized, metadata }
}

export function normalizePlateEvents(events = [], context = {}) {
  return events.map((event) => normalizeEvent(event, context))
}

export function toPyLabRobotCommands(events = []) {
  return events.map((event) => {
    switch (event.event_type) {
      case 'transfer':
        return buildTransferCommand(event)
      case 'incubate':
        return buildIncubateCommand(event)
      case 'read':
        return buildReadCommand(event)
      case 'wash':
        return buildWashCommand(event)
      default:
        return buildCustomCommand(event)
    }
  })
}

export function toPyalabSteps(events = []) {
  return events.map((event, index) => {
    const prefix = `Step ${index + 1}:`
    switch (event.event_type) {
      case 'transfer': {
        const sourcePlate = event.details?.source?.labware?.label || event.details?.source?.labware?.['@id'] || 'source'
        const targetPlate = event.details?.target?.labware?.label || event.details?.target?.labware?.['@id'] || 'target'
        const count = Object.keys(event.details?.target?.wells || {}).length
        return `${prefix} Transfer ${event.details?.volume || ''} from ${sourcePlate} to ${targetPlate} (${count} wells).`.trim()
      }
      case 'incubate': {
        const duration = event.details?.duration || 'unspecified duration'
        const temp = event.details?.temperature ? ` at ${event.details.temperature}` : ''
        return `${prefix} Incubate ${duration}${temp}.`
      }
      case 'read': {
        const instrument = event.details?.instrument || 'reader'
        const mode = event.details?.mode || 'read'
        return `${prefix} Run ${mode} on ${instrument}.`
      }
      case 'wash': {
        const wells = Array.isArray(event.details?.wells) && event.details.wells.length ? `${event.details.wells.length} wells` : 'all wells'
        return `${prefix} Wash ${wells} with ${event.details?.buffer?.label || 'wash buffer'}.`
      }
      default: {
        return `${prefix} ${event.details?.name || 'Custom event'} — ${event.details?.description || 'no description'}.`
      }
    }
  })
}

function normalizeEvent(event = {}, context = {}) {
  if (event.event_type && event.details) {
    return event
  }
  const wells = Array.isArray(event?.wells) ? [...event.wells] : []
  return {
    id: event.id || event.timestamp || `evt-${Math.random().toString(36).slice(2, 9)}`,
    event_type: 'other',
    timestamp: event.timestamp || new Date().toISOString(),
    run: context.recordMetadata?.runId || '',
    labware: event.labware || [primaryLabwareRef(context.recordMetadata)],
    details: {
      type: 'other',
      name: event.kind || 'custom',
      description: event.payload?.notes || '',
      metadata: {
        wells
      }
    }
  }
}

function buildTransferCommand(event) {
  const source = event.details?.source || {}
  const target = event.details?.target || {}
  return {
    command: 'transfer',
    volume: event.details?.volume || '',
    fromPlate: source.labware?.['@id'] || source.labware?.label || '',
    fromWells: Object.keys(source.wells || {}),
    toPlate: target.labware?.['@id'] || target.labware?.label || '',
    toWells: Object.keys(target.wells || {}),
    material: event.details?.material?.label || '',
    pipetting: event.details?.pipetting_hint || null
  }
}

function buildIncubateCommand(event) {
  return {
    command: 'incubate',
    labware: event.details?.labware?.['@id'] || event.details?.labware?.label || '',
    wells: Array.isArray(event.details?.wells) && event.details.wells.length ? event.details.wells : 'all',
    duration: event.details?.duration || '',
    temperature: event.details?.temperature || '',
    atmosphere: event.details?.atmosphere || ''
  }
}

function buildReadCommand(event) {
  return {
    command: 'read',
    labware: event.details?.labware?.['@id'] || event.details?.labware?.label || '',
    instrument: event.details?.instrument || '',
    mode: event.details?.mode || '',
    channels: event.details?.channels || [],
    resultFiles: event.details?.result_files || []
  }
}

function buildWashCommand(event) {
  return {
    command: 'wash',
    labware: event.details?.labware?.['@id'] || event.details?.labware?.label || '',
    wells: Array.isArray(event.details?.wells) && event.details.wells.length ? event.details.wells : 'all',
    buffer: event.details?.buffer?.label || '',
    cycles: event.details?.cycles || 1,
    volumePerCycle: event.details?.volume_per_cycle || ''
  }
}

function buildCustomCommand(event) {
  return {
    command: event.event_type || 'custom',
    labware: event.labware || [],
    details: event.details || {}
  }
}

function primaryLabwareRef(metadata = {}) {
  const recordId = metadata?.recordId || metadata?.id || 'plate'
  return {
    '@id': `plate/${recordId}`,
    kind: 'plate',
    label: metadata?.title || recordId
  }
}
