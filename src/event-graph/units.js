const VOLUME_FACTORS = {
  l: 1,
  liter: 1,
  liters: 1,
  ml: 1e-3,
  milliliter: 1e-3,
  milliliters: 1e-3,
  ul: 1e-6,
  µl: 1e-6,
  μl: 1e-6
}

const CONC_FACTORS = {
  m: 1,
  molar: 1,
  mm: 1e-3,
  millimolar: 1e-3,
  um: 1e-6,
  µm: 1e-6,
  μm: 1e-6,
  micromolar: 1e-6,
  nm: 1e-9,
  nanomolar: 1e-9
}

export function parseVolumeToLiters(value) {
  if (value && typeof value === 'object' && value.value !== undefined && value.unit) {
    const factor = VOLUME_FACTORS[String(value.unit).toLowerCase()]
    if (!factor) return null
    const numeric = Number(value.value)
    return Number.isFinite(numeric) ? numeric * factor : null
  }
  const parsed = parseNumericWithUnit(value)
  if (!parsed) return null
  const factor = VOLUME_FACTORS[parsed.unit.toLowerCase()]
  if (!factor) return null
  return parsed.value * factor
}

export function parseConcentrationToMolar(value, options = {}) {
  if (value && typeof value === 'object' && value.value !== undefined && value.unit) {
    const parsed = { value: Number(value.value), unit: String(value.unit) }
    if (!Number.isFinite(parsed.value)) return null
    return parseConcentrationToMolar(`${parsed.value} ${parsed.unit}`, options)
  }
  const parsed = parseNumericWithUnit(value)
  if (!parsed) return null
  const unit = parsed.unit.toLowerCase()
  if (CONC_FACTORS[unit] !== undefined) {
    return parsed.value * CONC_FACTORS[unit]
  }
  if (unit === 'mg/ml' || unit === 'mgmL' || unit === 'mg per ml') {
    const molarMass = options.molarMass
    if (!isFinite(molarMass) || molarMass <= 0) return null
    return (parsed.value / 1000) / molarMass
  }
  return null
}

export function parseNumericWithUnit(input) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^([\d.+-eE]+)\s*([^\s]+)$/)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return { value, unit: match[2] }
}

export function normalizeVolume(input, fallback = 0) {
  const liters = parseVolumeToLiters(input)
  return liters ?? fallback
}

export function normalizeConcentration(input, options = {}) {
  return parseConcentrationToMolar(input, options)
}
