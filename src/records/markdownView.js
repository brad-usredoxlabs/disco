import { humanizeKey } from './utils.js'

export function generateMarkdownView(recordType, metadata = {}, bodyData = {}, bundle = {}) {
  const sections = []
  const header = buildHeaderSection(recordType, metadata)
  const overview = buildOverviewSection(metadata)
  const links = buildLinksSection(metadata, bodyData)
  const biology = buildBiologySection(bodyData)
  const operations = buildOperationsSection(metadata, bodyData)
  const attachments = buildAttachmentsSection(bodyData)

  ;[header, overview, links, biology, operations, attachments].forEach((section) => {
    if (section) sections.push(section)
  })

  return sections.join('\n\n').trim() + '\n'
}

export function buildFieldDescriptors(recordType, bundle = {}) {
  const schema = bundle.recordSchemas?.[recordType] || {}
  const props = schema.properties || {}
  const layout = bundle.uiConfigs?.[recordType]?.layout?.fields || {}
  const metadataSet = new Set(bundle.metadataFields?.[recordType] || [])
  const metadataDescriptors = []
  const bodyDescriptors = []

  Object.entries(props).forEach(([name, schemaField]) => {
    const layoutConfig = layout[name] || {}
    const uiConfig = layoutConfig.ui || {}
    if (schemaField.readOnly) return
    const descriptor = {
      name,
      schema: schemaField,
      config: layoutConfig,
      label: layoutConfig.label || humanizeKey(name),
      fieldType: uiConfig.fieldType || layoutConfig.fieldType || schemaField.fieldType || null,
      vocab: uiConfig.vocab || layoutConfig.vocab || schemaField.vocab || null,
      columns: uiConfig.columns || layoutConfig.columns || [],
      component: uiConfig.component || layoutConfig.component || null,
      valuePath: uiConfig.valuePath || layoutConfig.valuePath || null,
      jsonLd: resolveJsonLdPlacement(name, metadataSet, layoutConfig.jsonLd || {})
    }
    if (metadataSet.has(name)) {
      metadataDescriptors.push(descriptor)
    } else {
      bodyDescriptors.push(descriptor)
    }
  })

  metadataDescriptors.sort(byOrder)
  bodyDescriptors.sort(byOrder)
  return { metadata: metadataDescriptors, body: bodyDescriptors }
}

function resolveJsonLdPlacement(fieldName, metadataSet, jsonLdConfig = {}) {
  if (jsonLdConfig.target === 'metadata') {
    return {
      target: 'metadata',
      section: null,
      key: jsonLdConfig.key || fieldName
    }
  }
  if (jsonLdConfig.target === 'data') {
    return {
      target: 'data',
      section: jsonLdConfig.section || 'operations',
      key: jsonLdConfig.key || fieldName
    }
  }
  if (metadataSet.has(fieldName)) {
    return {
      target: 'metadata',
      section: null,
      key: jsonLdConfig.key || fieldName
    }
  }
  return {
    target: 'data',
    section: jsonLdConfig.section || 'operations',
    key: jsonLdConfig.key || fieldName
  }
}

export function buildBodyDefaults(recordType, bundle = {}) {
  const descriptors = buildFieldDescriptors(recordType, bundle).body
  const defaults = {}
  descriptors.forEach(({ name, schema, fieldType }) => {
    if (fieldType === 'ontology') {
      defaults[name] = null
      return
    }
    defaults[name] = schema?.default !== undefined ? cloneValue(schema.default) : defaultValue(schema?.type)
  })
  return defaults
}

function byOrder(a, b) {
  return (a.config.order ?? 0) - (b.config.order ?? 0)
}

function defaultValue(type) {
  if (type === 'array') return []
  if (type === 'object') return {}
  if (type === 'boolean') return false
  if (type === 'number' || type === 'integer') return null
  return ''
}

function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}

function buildHeaderSection(recordType, metadata = {}) {
  const humanizedType = humanizeKey(recordType || 'record')
  const title = (metadata.title || `Untitled ${humanizedType}`).trim()
  const recordId = metadata.recordId || metadata.id || ''
  const headerLine = `# ${title}${recordId ? ` (${recordId})` : ''}`
  const badges = []
  if (metadata.state) badges.push(`**Status:** ${metadata.state}`)
  if (recordType) badges.push(`**Record type:** ${humanizedType}`)
  if (metadata.shortSlug) badges.push(`**Slug:** ${metadata.shortSlug}`)
  if (metadata.projectId) badges.push(`**Project:** ${formatInlineReference(metadata.projectId)}`)
  return badges.length ? `${headerLine}\n${badges.join(' · ')}` : headerLine
}

function buildOverviewSection(metadata = {}) {
  const description = metadata.description?.trim()
  const paragraph = description?.length ? description : '_No description provided._'
  return `## Overview\n${paragraph}`
}

function buildLinksSection(metadata = {}, bodyData = {}) {
  const entries = []
  const projectRef = metadata.projectId || metadata.project?.id || bodyData.projectId || pickFirst([
    bodyData.project,
    bodyData.projectLink,
    bodyData.links?.project
  ])
  if (projectRef) {
    entries.push(`- **Project:** ${formatReference(projectRef)}`)
  }

  const runs = ensureArray(bodyData.runs || bodyData.links?.runs)
  if (runs.length) {
    entries.push(`- **Runs:** ${runs.map(formatReference).join(', ')}`)
  }

  const samples = ensureArray(bodyData.samples)
  if (samples.length) {
    entries.push(`- **Samples:** ${samples.map(formatReference).join(', ')}`)
  }

  const plates = ensureArray([
    bodyData.plateId,
    metadata.plateId,
    bodyData.operations?.plateId,
    bodyData.plate
  ]).filter(Boolean)
  if (plates.length) {
    entries.push(`- **Plate:** ${plates.map(formatReference).join(', ')}`)
  }

  const binaries = ensureArray(
    bodyData.binaryDataFiles ||
      bodyData.attachments ||
      bodyData.links?.binaryDataFiles ||
      bodyData.operations?.binaryDataFiles
  )
  if (binaries.length) {
    entries.push(`- **Binary files:** ${binaries.map(formatReference).join(', ')}`)
  }

  const content = entries.length ? entries.join('\n') : '_No linked records recorded._'
  return `## Linked Records\n${content}`
}

function buildBiologySection(bodyData = {}) {
  const taxon = pickOntology(bodyData.taxon || bodyData.biology?.taxon)
  const tissue = pickOntology(bodyData.anatomicalContext || bodyData.biology?.anatomicalContext)
  const cellTypes = ensureArray(bodyData.cellTypes || bodyData.biology?.cellTypes).map((entry) =>
    formatOntology(entry)
  )
  const pathways = ensureArray(bodyData.pathways || bodyData.biology?.pathways).map((entry) =>
    formatOntology(entry)
  )
  const biologyEntities = Array.isArray(bodyData.biology?.entities) ? bodyData.biology.entities.length : 0

  const sentences = []
  if (taxon && tissue) {
    sentences.push(
      `This record focuses on ${formatOntology(taxon, { italic: true })} in ${formatOntology(tissue)}.`
    )
  } else if (taxon) {
    sentences.push(`This record focuses on ${formatOntology(taxon, { italic: true })}.`)
  } else if (tissue) {
    sentences.push(`Anatomical context: ${formatOntology(tissue)}.`)
  }

  if (cellTypes.length) {
    sentences.push(`Cell types: ${cellTypes.join(', ')}.`)
  }

  if (pathways.length) {
    sentences.push(`Pathways: ${pathways.join(', ')}.`)
  }

  if (biologyEntities) {
    sentences.push(`Additional biology entities recorded: ${biologyEntities}.`)
  }

  const content = sentences.length ? sentences.join(' ') : '_No biological context recorded._'
  return `## Biological Context\n${content}`
}

function buildOperationsSection(metadata = {}, bodyData = {}) {
  const entries = []
  const operator = bodyData.operator || bodyData.operations?.operator
  if (operator) {
    entries.push(`- **Operator:** ${formatOntology(operator)}`)
  }

  const runDate = bodyData.runDate || bodyData.startedAt || bodyData.operations?.startedAt
  if (runDate) {
    entries.push(`- **Start:** ${runDate}`)
  }
  const completedAt = bodyData.completedAt || bodyData.operations?.completedAt
  if (completedAt) {
    entries.push(`- **Completed:** ${completedAt}`)
  }
  const createdAt = metadata.createdAt
  if (createdAt) {
    entries.push(`- **Created:** ${createdAt}`)
  }
  const updatedAt = metadata.updatedAt
  if (updatedAt) {
    entries.push(`- **Updated:** ${updatedAt}`)
  }
  const recipe = bodyData.recipeCard
  if (recipe?.steps?.length) {
    entries.push(`- **Recipe steps:** ${recipe.steps.length}`)
  }
  const reagents = ensureArray(bodyData.reagents)
  if (reagents.length) {
    entries.push(`- **Reagents:** ${reagents.length}`)
  }

  const content = entries.length ? entries.join('\n') : '_No operational metadata recorded._'
  return `## Operations\n${content}`
}

function buildAttachmentsSection(bodyData = {}) {
  const binaries = ensureArray(
    bodyData.binaryDataFiles ||
      bodyData.attachments ||
      bodyData.links?.binaryDataFiles ||
      bodyData.operations?.binaryDataFiles
  )
  if (!binaries.length) {
    return `## Attachments\n_No binary files linked._`
  }
  const lines = binaries.map((entry) => `- ${formatReference(entry)}`)
  return `## Attachments\n${lines.join('\n')}`
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null)
  if (value === undefined || value === null || value === '') return []
  return [value]
}

function pickOntology(value) {
  if (!value) return null
  if (Array.isArray(value)) {
    return value.length ? pickOntology(value[0]) : null
  }
  if (typeof value === 'string') {
    return { label: value, id: value }
  }
  if (typeof value === 'object') {
    return {
      label: value.label || value.name || value.prefLabel || '',
      id: value.id || value.identifier || value['@id'] || '',
      ...value
    }
  }
  return null
}

function formatOntology(value, options = {}) {
  if (!value) return ''
  const entry = pickOntology(value)
  if (!entry) return ''
  const id = entry.id || ''
  const label = entry.label || id || ''
  const italicLabel = options.italic && label ? `*${label}*` : label
  if (italicLabel && id && italicLabel !== id) {
    return `${italicLabel} (${id})`
  }
  return italicLabel || id
}

function formatReference(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'object') {
    const label = value.label || value.title || value.name || value.shortSlug || ''
    const id = value.id || value.identifier || value['@id'] || ''
    if (label && id && label !== id) {
      return `${label} (${id})`
    }
    return label || id || JSON.stringify(value)
  }
  return String(value)
}

function formatInlineReference(value, fallbackLabel) {
  if (!value && !fallbackLabel) return ''
  if (fallbackLabel && value) {
    return `${fallbackLabel} (${value})`
  }
  if (fallbackLabel) return fallbackLabel
  return formatReference(value)
}

function pickFirst(candidates = []) {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      return candidate
    }
  }
  return null
}
