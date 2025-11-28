export function buildRecordContextOverrides(node) {
  if (!node) return {}
  const biologyEntities = collectAncestorBiology(node, new Set())
  const prefixOverrides = collectAncestorPrefixes(node, new Set())
  const overrides = {}
  if (biologyEntities.length) {
    overrides.biology = { entities: biologyEntities }
  }
  if (Object.keys(prefixOverrides).length) {
    overrides.prefixes = prefixOverrides
  }
  return overrides
}

export function mergeContextOverrides(base = {}, addition = {}) {
  if (!base || Object.keys(base).length === 0) return cloneValue(addition)
  if (!addition || Object.keys(addition).length === 0) return cloneValue(base)
  const merged = {}
  if (base.prefixes || addition.prefixes) {
    merged.prefixes = { ...(base.prefixes || {}) }
    Object.entries(addition.prefixes || {}).forEach(([key, value]) => {
      if (!(key in merged.prefixes)) {
        merged.prefixes[key] = value
      }
    })
  }
  const baseBiology = base.biology?.entities || []
  const additionBiology = addition.biology?.entities || []
  if (baseBiology.length || additionBiology.length) {
    merged.biology = {
      entities: [...cloneValue(baseBiology), ...cloneValue(additionBiology)]
    }
  }
  return merged
}

function collectAncestorBiology(node, visited) {
  const cacheKey = node?.id || node?.path
  if (!node || (cacheKey && visited.has(cacheKey))) return []
  if (cacheKey) visited.add(cacheKey)
  let results = []
  ;(node.parents || []).forEach((edge) => {
    const parentNode = edge?.targetNode
    if (!parentNode) return
    const parentEntities = Array.isArray(parentNode.frontMatter?.biology?.entities)
      ? cloneValue(parentNode.frontMatter.biology.entities)
      : []
    if (parentEntities.length) {
      results = results.concat(parentEntities)
    }
    const ancestor = collectAncestorBiology(parentNode, visited)
    if (ancestor.length) {
      results = results.concat(ancestor)
    }
  })
  return results
}

function collectAncestorPrefixes(node, visited) {
  const cacheKey = node?.id || node?.path
  if (!node || (cacheKey && visited.has(cacheKey))) return {}
  if (cacheKey) visited.add(cacheKey)
  const collected = {}
  ;(node.parents || []).forEach((edge) => {
    const parentNode = edge?.targetNode
    if (!parentNode) return
    const parentPrefixes = parentNode.frontMatter?.jsonldContextOverrides?.prefixes
    if (parentPrefixes && typeof parentPrefixes === 'object') {
      Object.entries(parentPrefixes).forEach(([key, value]) => {
        if (!(key in collected)) {
          collected[key] = value
        }
      })
    }
    const ancestor = collectAncestorPrefixes(parentNode, visited)
    Object.entries(ancestor).forEach(([key, value]) => {
      if (!(key in collected)) {
        collected[key] = value
      }
    })
  })
  return collected
}

function cloneValue(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}
