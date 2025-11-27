export function normalizeOntologyValue(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    return { id: entry, label: entry, source: '' }
  }
  if (typeof entry !== 'object') return null
  const id = entry.id || entry['@id'] || ''
  const label = entry.label || entry.prefLabel || entry.name || id
  if (!id && !label) return null
  return {
    id,
    label,
    source: entry.source || entry.ontology || '',
    definition: entry.definition || entry.description || ''
  }
}

export function normalizeOntologyListEntry(entry, config = {}) {
  if (!entry) return null
  const base = normalizeOntologyValue(entry)
  if (!base) return null
  const extras = { ...entry }
  delete extras.id
  delete extras.label
  delete extras.source
  delete extras.definition
  return {
    ...extras,
    ...base
  }
}

export function normalizeOntologyListValue(value, config = {}) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => normalizeOntologyListEntry(entry, config)).filter(Boolean)
}

export function normalizeRecipeValue(value) {
  if (!value || typeof value !== 'object') {
    return {
      items: [],
      steps: []
    }
  }
  const items = Array.isArray(value.items)
    ? value.items.map((item) => ({
        quantity: item.quantity || '',
        unit: item.unit || '',
        notes: item.notes || '',
        reagent: item.reagent ? normalizeOntologyValue(item.reagent) : null
      }))
    : []
  const steps = Array.isArray(value.steps) ? value.steps.slice() : []
  return {
    items,
    steps
  }
}
