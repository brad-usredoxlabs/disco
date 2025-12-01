export const ONTOLOGY_SHAPES = Object.freeze({
  TERM: 'term',
  REFERENCE: 'reference'
})

export function resolveOntologyShape(schema, fallback = ONTOLOGY_SHAPES.TERM) {
  if (!schema || typeof schema !== 'object') return fallback
  if (typeof schema.$ref === 'string' && schema.$ref.includes('ontology-term')) {
    return ONTOLOGY_SHAPES.TERM
  }
  if (schema.type === 'object') {
    if (schema.properties?.identifier) return ONTOLOGY_SHAPES.TERM
    if (schema.properties?.id) return ONTOLOGY_SHAPES.REFERENCE
  }
  if (schema.type === 'array') {
    return resolveOntologyShape(schema.items, fallback)
  }
  return fallback
}

export function normalizeOntologyValue(entry, options = {}) {
  if (!entry) return null
  const normalizedOptions = typeof options === 'object' ? options : {}
  const shape =
    normalizedOptions.shape ||
    resolveOntologyShape(normalizedOptions.schema, normalizedOptions.fallbackShape || ONTOLOGY_SHAPES.TERM)

  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    if (!trimmed) return null
    return shape === ONTOLOGY_SHAPES.REFERENCE
      ? { id: trimmed, label: trimmed, source: '' }
      : { identifier: trimmed, label: trimmed, ontology: '', definition: '', synonyms: [], xrefs: [] }
  }
  if (typeof entry !== 'object') return null

  const identifier = entry.identifier || entry.id || entry['@id'] || ''
  const label = entry.label || entry.prefLabel || entry.name || identifier
  if (!identifier && !label) return null
  const ontology = entry.ontology || entry.source || ''

  if (shape === ONTOLOGY_SHAPES.REFERENCE) {
    return {
      id: identifier || label,
      label,
      source: ontology || ''
    }
  }

  return {
    identifier: identifier || '',
    label,
    definition: entry.definition || entry.description || '',
    ontology,
    synonyms: normalizeStringArray(entry.synonyms || entry.synonym),
    xrefs: normalizeStringArray(entry.xrefs)
  }
}

export function normalizeOntologyListEntry(entry, config = {}) {
  if (!entry) return null
  const itemSchema = config?.schema?.items || config?.schema
  const shape = config.shape || resolveOntologyShape(itemSchema, config.fallbackShape || ONTOLOGY_SHAPES.REFERENCE)
  const base = normalizeOntologyValue(entry, { shape, schema: itemSchema, fallbackShape: ONTOLOGY_SHAPES.REFERENCE })
  if (!base) return null
  const extras = { ...entry }
  ;['id', 'identifier', 'label', 'source', 'ontology', 'definition', 'synonyms', 'xrefs', '@id', 'prefLabel'].forEach(
    (key) => {
      delete extras[key]
    }
  )
  return {
    ...extras,
    ...base
  }
}

export function normalizeOntologyListValue(value, config = {}) {
  if (!Array.isArray(value)) return []
  const itemSchema = config?.schema?.items || config?.schema
  const shape = config.shape || resolveOntologyShape(itemSchema, config.fallbackShape || ONTOLOGY_SHAPES.REFERENCE)
  return value
    .map((entry) => normalizeOntologyListEntry(entry, { ...config, schema: itemSchema, shape }))
    .filter(Boolean)
}

export function normalizeRecipeValue(value, schema) {
  if (!value || typeof value !== 'object') {
    return {
      items: [],
      steps: []
    }
  }
  const reagentSchema = schema?.properties?.items?.items?.properties?.reagent
  const items = Array.isArray(value.items)
    ? value.items.map((item) => ({
        quantity: item.quantity || '',
        unit: item.unit || '',
        notes: item.notes || '',
        reagent: item.reagent ? normalizeOntologyValue(item.reagent, { schema: reagentSchema }) : null
      }))
    : []
  const steps = Array.isArray(value.steps) ? value.steps.slice() : []
  return {
    items,
    steps
  }
}

function normalizeStringArray(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry !== '')
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  return []
}
