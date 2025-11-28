export function flattenFrontMatter(frontMatter = {}) {
  const metadata = isPlainObject(frontMatter.metadata) ? cloneValue(frontMatter.metadata) : {}
  const dataSections = isPlainObject(frontMatter.data) ? frontMatter.data : {}
  const node = { ...metadata }

  Object.values(dataSections).forEach((section) => {
    if (!isPlainObject(section)) return
    Object.entries(section).forEach(([key, value]) => {
      if (value === undefined) return
      node[key] = cloneValue(value)
    })
  })

  const biologyEntities = dataSections?.biology?.entities
  if (Array.isArray(biologyEntities) && biologyEntities.length) {
    node.biologyEntities = cloneValue(biologyEntities)
  }

  return node
}

export function normalizeBaseIri(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  return value.trim().replace(/\/+$/, '')
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}
