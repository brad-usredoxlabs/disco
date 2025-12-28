function dedupeStrings(list = []) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  list.forEach((value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    const lower = trimmed.toLowerCase()
    if (seen.has(lower)) return
    seen.add(lower)
    out.push(trimmed)
  })
  return out
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

export function validateMaterialEntry(entry = {}, featureList = []) {
  const errors = []
  if (!entry.id) errors.push('id is required')
  if (!entry.label) errors.push('label is required')
  if (!entry.category) errors.push('category is required')
  const intents = dedupeStrings(entry.experimental_intents || entry.intents || [])
  if (!intents.length) errors.push('experimental_intents must include at least one intent')
  const featureSet = new Set(featureList.map((f) => f.id).filter(Boolean))

  if (intents.includes('sample')) {
    const cls = ensureArray(entry.classified_as).filter(
      (c) => c?.id && c?.label && ['taxon', 'cell_line', 'tissue'].includes(c.domain)
    )
    if (!cls.length) errors.push('sample intent requires classified_as (taxon/cell_line/tissue)')
  }

  if (intents.includes('treatment')) {
    const mech = entry.mechanism || {}
    if (!mech.type) {
      errors.push('treatment intent requires mechanism.type')
    } else if (mech.type !== 'other') {
      const targets = ensureArray(mech.targets).filter((t) => t?.id && t?.label)
      if (!targets.length) errors.push('treatment intent requires mechanism.targets when type is not other')
    }
  }

  if (intents.includes('assay_material')) {
    const measures = ensureArray(entry.measures).filter(Boolean)
    if (!measures.length) {
      errors.push('assay_material intent requires measures (feature IDs)')
    } else if (featureSet.size) {
      const missing = measures.filter((m) => !featureSet.has(m))
      if (missing.length) errors.push(`assay_material measures missing in feature vocab: ${missing.join(', ')}`)
    }
  }

  if (intents.includes('control')) {
    if (!entry.control_role) errors.push('control intent requires control_role')
    const controlFeatures = ensureArray(entry.control_for?.features).filter(Boolean)
    if (!controlFeatures.length) {
      errors.push('control intent requires control_for.features (feature IDs)')
    } else if (featureSet.size) {
      const missing = controlFeatures.filter((m) => !featureSet.has(m))
      if (missing.length) errors.push(`control_for.features missing in feature vocab: ${missing.join(', ')}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

export function validateAgainstFeatureSet(values = [], featureList = []) {
  const featureSet = new Set(featureList.map((f) => f.id).filter(Boolean))
  return ensureArray(values)
    .filter(Boolean)
    .filter((value) => !featureSet.size || !featureSet.has(value))
}
