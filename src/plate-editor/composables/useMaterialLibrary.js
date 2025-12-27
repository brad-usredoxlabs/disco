import { computed, ref, watch } from 'vue'
import YAML from 'yaml'
import { ensureMaterialId } from '../utils/materialId'

const DEFAULT_SOURCES = [
  { path: '/vocab/materials.core.yaml', optional: true },
  { path: '/vocab/materials.lab.yaml', optional: true }
]

export function useMaterialLibrary(repoConnection, options = {}) {
  const sources = options.sources || DEFAULT_SOURCES
  const entries = ref([])
  const status = ref('idle')
  const error = ref('')
  const lastLoadedAt = ref(null)
  const version = ref(0)

  async function readSource(path, { optional = true } = {}) {
    try {
      const payload = await repoConnection.readFile(path)
      return YAML.parse(payload) || []
    } catch (err) {
      if (optional) return []
      throw new Error(`Failed to read ${path}: ${err?.message || err}`)
    }
  }

  async function reload() {
    if (!repoConnection?.directoryHandle?.value) {
      entries.value = []
      status.value = 'idle'
      error.value = ''
      return
    }
    status.value = 'loading'
    error.value = ''
    try {
      const aggregated = []
      const seenIds = new Set()
      for (const source of sources) {
        const sourcePath = typeof source === 'string' ? source : source?.path
        if (!sourcePath) continue
        const optional = typeof source === 'object' ? source.optional !== false : true
        const list = await readSource(sourcePath, { optional })
        list
          .map((entry) => normalizeMaterialEntry(entry, sourcePath))
          .filter(Boolean)
          .forEach((entry) => {
            if (seenIds.has(entry.id)) {
              // Later sources override earlier ones
              const index = aggregated.findIndex((item) => item.id === entry.id)
              aggregated.splice(index, 1, entry)
            } else {
              aggregated.push(entry)
              seenIds.add(entry.id)
            }
          })
      }
      entries.value = aggregated
      lastLoadedAt.value = new Date()
      version.value += 1
      status.value = 'ready'
    } catch (err) {
      error.value = err?.message || 'Unable to load material library.'
      status.value = 'error'
      entries.value = []
    }
  }

  const materialById = computed(() => {
    const map = {}
    entries.value.forEach((entry) => {
      map[entry.id] = entry
    })
    return map
  })

  watch(
    () => repoConnection?.directoryHandle?.value,
    (handle) => {
      if (handle) {
        reload()
      } else {
        entries.value = []
      }
    },
    { immediate: true }
  )

  return {
    entries,
    status,
    error,
    lastLoadedAt,
    materialById,
    version,
    reload
  }
}

function normalizeMaterialEntry(entry = {}, sourcePath = '') {
  const label = (entry.label || entry.id || '').trim()
  if (!label) return null
  const rawId = entry.id || label
  const id = rawId && rawId.includes(':') ? rawId : ensureMaterialId(rawId)
  const tags = Array.isArray(entry.tags)
    ? entry.tags
        .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
        .filter(Boolean)
    : []
  const synonyms = Array.isArray(entry.synonyms)
    ? entry.synonyms.filter((syn) => typeof syn === 'string' && syn.trim().length)
    : []
  const xrefTokens = buildXrefTokens(entry?.xref)
  const defaults = normalizeDefaults(entry.defaults)

  return {
    ...entry,
    id,
    label,
    tags,
    synonyms,
    defaults,
    searchTokens: buildSearchTokens({ id, label, tags, synonyms, xrefTokens }),
    __source: sourcePath
  }
}

function buildXrefTokens(xref = {}) {
  if (!xref || typeof xref !== 'object') return []
  return Object.values(xref)
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean)
}

function buildSearchTokens({ id, label, tags = [], synonyms = [], xrefTokens = [] }) {
  const bucket = new Set()
  ;[id, label, ...tags, ...synonyms, ...xrefTokens]
    .map((token) => (typeof token === 'string' ? token.trim().toLowerCase() : ''))
    .filter(Boolean)
    .forEach((token) => bucket.add(token))
  return Array.from(bucket)
}

function normalizeDefaults(defaults) {
  if (!defaults || typeof defaults !== 'object') return {}
  const normalized = {}
  if (defaults.role && typeof defaults.role === 'string') {
    normalized.role = defaults.role
  }
  if (defaults.amount && typeof defaults.amount === 'object') {
    const amount = normalizeAmount(defaults.amount)
    if (amount) normalized.amount = amount
  }
  return normalized
}

function normalizeAmount(amount = {}) {
  const value = Number(amount.value)
  const unit = typeof amount.unit === 'string' ? amount.unit.trim() : ''
  if (!Number.isFinite(value) || !unit) return null
  return { value, unit }
}
