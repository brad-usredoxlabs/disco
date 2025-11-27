import { humanizeKey } from './utils.js'

const BLANK_PLACEHOLDER = '_____'

export function generateMarkdownView(recordType, metadata = {}, bodyData = {}, bundle = {}) {
  const descriptors = buildFieldDescriptors(recordType, bundle)
  const lines = []

  lines.push('***Metadata***\n')
  descriptors.metadata.forEach((descriptor) => {
    lines.push(formatMetadataField(descriptor, metadata))
  })

  lines.push('\n***Record Body***\n')
  descriptors.body.forEach((descriptor) => {
    lines.push(formatBodyField(descriptor, metadata, bodyData))
  })

  return lines.join('\n').trim() + '\n'
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

function formatMetadataField(descriptor, metadata) {
  const value = metadata?.[descriptor.name]
  const text = formatMetadataValue(value)
  return `**${descriptor.label}:** ${text}`
}

function formatMetadataValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return BLANK_PLACEHOLDER
    return value.join(', ')
  }
  if (value === null || value === undefined || value === '') {
    return BLANK_PLACEHOLDER
  }
  if (typeof value === 'object') {
    return '```yaml\n' + JSON.stringify(value, null, 2) + '\n```'
  }
  return String(value)
}

function formatBodyField(descriptor, metadata, bodyData) {
  const value =
    (bodyData && bodyData.hasOwnProperty(descriptor.name) && bodyData[descriptor.name] !== undefined
      ? bodyData[descriptor.name]
      : metadata[descriptor.name])
  const heading = `### ${descriptor.label}`
  let text = ''
  if (descriptor.fieldType === 'ontology') {
    text = formatOntologyBodyValue(value)
  } else if (descriptor.fieldType === 'recipeCard') {
    text = formatRecipeCardBody(value)
  } else if (descriptor.fieldType === 'ontologyList') {
    text = formatOntologyListBody(value)
  } else if (Array.isArray(value)) {
    text = value.length ? value.map((item) => `- ${item || BLANK_PLACEHOLDER}`).join('\n') : `- ${BLANK_PLACEHOLDER}`
  } else if (descriptor.schema?.type === 'object') {
    const jsonValue = value && typeof value === 'object' ? JSON.stringify(value, null, 2) : '{}'
    text = '```yaml\n' + jsonValue + '\n```'
  } else if (value === null || value === undefined || value === '') {
    text = BLANK_PLACEHOLDER
  } else {
    text = String(value)
  }
  if (!text?.trim()) {
    text = BLANK_PLACEHOLDER
  }
  return `${heading}\n${text}\n`
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

function formatOntologyBodyValue(value) {
  if (!value) return BLANK_PLACEHOLDER
  const normalize = (entry) => {
    if (!entry) return ''
    if (typeof entry === 'string') return entry
    const label = entry.label || entry.name || ''
    const id = entry.id || ''
    if (label && id) return `${label} (${id})`
    return label || id
  }
  if (Array.isArray(value)) {
    if (!value.length) return `- ${BLANK_PLACEHOLDER}`
    return value.map((entry) => `- ${normalize(entry) || BLANK_PLACEHOLDER}`).join('\n')
  }
  return normalize(value) || BLANK_PLACEHOLDER
}

function formatRecipeCardBody(value) {
  if (!value || typeof value !== 'object') return BLANK_PLACEHOLDER
  const items = Array.isArray(value.items) ? value.items : []
  const steps = Array.isArray(value.steps) ? value.steps : []
  const lines = []
  if (items.length) {
    lines.push('| Quantity | Unit | Reagent | Notes |')
    lines.push('| --- | --- | --- | --- |')
    items.forEach((item) => {
      const reagent = item.reagent
        ? `${item.reagent.label || item.reagent.id || ''} (${item.reagent.id || ''})`
        : ''
      lines.push(`| ${item.quantity || ''} | ${item.unit || ''} | ${reagent} | ${item.notes || ''} |`)
    })
    lines.push('')
  }
  if (steps.length) {
    lines.push('Steps:')
    steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step || ''}`)
    })
  }
  if (!items.length && !steps.length) {
    lines.push(BLANK_PLACEHOLDER)
  }
  return lines.join('\n')
}

function formatOntologyListBody(value) {
  if (!Array.isArray(value) || !value.length) return `- ${BLANK_PLACEHOLDER}`
  const reservedKeys = new Set(['id', 'label', 'source', 'definition', 'synonyms', 'raw'])
  const lines = value.map((entry) => {
    const label = entry?.label || entry?.id || BLANK_PLACEHOLDER
    const id = entry?.id ? ` (${entry.id})` : ''
    const extras = Object.entries(entry || {})
      .filter(([key, extraValue]) => {
        if (reservedKeys.has(key)) return false
        if (extraValue === undefined || extraValue === null) return false
        if (typeof extraValue === 'object') return false
        const text = String(extraValue).trim()
        return text.length > 0
      })
      .map(([key, extraValue]) => `${key}: ${extraValue}`)
      .join('; ')
    const details = extras ? ` — ${extras}` : ''
    return `- ${label}${id}${details}`
  })
  return lines.join('\n')
}
