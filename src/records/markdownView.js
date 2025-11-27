import { humanizeKey } from './utils.js'

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
      columns: uiConfig.columns || layoutConfig.columns || []
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
  const value = metadata[descriptor.name]
  if (Array.isArray(value)) {
    if (value.length === 0) return `**${descriptor.label}:**`
    return `**${descriptor.label}:** ${value.join(', ')}`
  }
  if (value === null || value === undefined || value === '') {
    return `**${descriptor.label}:**`
  }
  return `**${descriptor.label}:** ${value}`
}

function formatBodyField(descriptor, metadata, bodyData) {
  const value =
    (bodyData && bodyData.hasOwnProperty(descriptor.name) && bodyData[descriptor.name] !== undefined
      ? bodyData[descriptor.name]
      : metadata[descriptor.name])
  const heading = `### ${descriptor.label}`
  if (descriptor.fieldType === 'ontology') {
    const text = formatOntologyBodyValue(value)
    return `${heading}\n${text}\n`
  }
  if (descriptor.fieldType === 'recipeCard') {
    const text = formatRecipeCardBody(value)
    return `${heading}\n${text}\n`
  }
  if (descriptor.fieldType === 'ontologyList') {
    const text = formatOntologyListBody(value)
    return `${heading}\n${text}\n`
  }
  if (Array.isArray(value) && value.length) {
    const items = value.map((item) => `- ${item || ''}`).join('\n')
    return `${heading}\n${items}`
  }
  if (descriptor.schema?.type === 'object') {
    const jsonValue = value && typeof value === 'object' ? JSON.stringify(value, null, 2) : `${descriptor.name}: {}`
    return `${heading}\n\`\`\`yaml\n${jsonValue}\n\`\`\``
  }
  const text = value ?? ''
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
  if (!value) return ''
  const normalize = (entry) => {
    if (!entry) return ''
    if (typeof entry === 'string') return entry
    const label = entry.label || entry.name || ''
    const id = entry.id || ''
    if (label && id) return `${label} (${id})`
    return label || id
  }
  if (Array.isArray(value)) {
    return value.map((entry) => `- ${normalize(entry)}`).join('\n')
  }
  return normalize(value)
}

function formatRecipeCardBody(value) {
  if (!value || typeof value !== 'object') return ''
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
  return lines.join('\n')
}

function formatOntologyListBody(value) {
  if (!Array.isArray(value) || !value.length) return ''
  const reservedKeys = new Set(['id', 'label', 'source', 'definition', 'synonyms', 'raw'])
  const lines = value.map((entry) => {
    const label = entry?.label || entry?.id || ''
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
