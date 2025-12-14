export function slugifyMaterialId(value = '') {
  const normalized = (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!normalized) {
    return 'material'
  }
  if (!/^[a-z]/.test(normalized)) {
    return `m_${normalized}`
  }
  return normalized
}

export function ensureMaterialId(raw = '') {
  const base = typeof raw === 'string' ? raw : ''
  const trimmed = base.replace(/^material:/i, '')
  const slug = slugifyMaterialId(trimmed)
  return `material:${slug || 'unnamed'}`
}

export function generateUniqueMaterialId(input = '', existingIds = [], options = {}) {
  const ids = Array.isArray(existingIds) ? existingIds : []
  const ignoreId = options.skipId ? options.skipId.toLowerCase() : null
  const occupied = new Set(ids.map((id) => (typeof id === 'string' ? id.toLowerCase() : '')))
  if (ignoreId) {
    occupied.delete(ignoreId)
  }
  let candidate = ensureMaterialId(input)
  if (!occupied.has(candidate.toLowerCase())) {
    return candidate
  }
  const prefix = candidate.replace(/^material:/, '')
  let counter = 2
  while (true) {
    const next = `material:${prefix}_${counter}`
    if (!occupied.has(next.toLowerCase())) {
      return next
    }
    counter += 1
  }
}
