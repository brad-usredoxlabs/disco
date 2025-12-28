import { computed, ref, watch } from 'vue'
import YAML from 'yaml'
import { ensureMaterialId } from '../utils/materialId'
import { attachLatestRevision } from '../../vocab/materialResolver'

const DEFAULT_INDEX_PATH = '/vocab/materials.index.json'
const DEFAULT_CONCEPT_DIR = '/vocab/materials'
const DEFAULT_REVISION_DIR = '/vocab/material-revisions'

export function useMaterialLibrary(repoConnection, options = {}) {
  const indexPath = options.indexPath || DEFAULT_INDEX_PATH
  const conceptDir = options.conceptDir || DEFAULT_CONCEPT_DIR
  const revisionDir = options.revisionDir || DEFAULT_REVISION_DIR
  const entries = ref([])
  const status = ref('idle')
  const error = ref('')
  const lastLoadedAt = ref(null)
  const version = ref(0)

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
      // Option 1: load prebuilt index (fast path)
      let materials = []
      let usedIndex = false
      try {
        materials = await loadMaterialIndex(repoConnection, indexPath)
        usedIndex = materials.length > 0
      } catch (err) {
        console.warn('[MaterialLibrary] Failed to load materials index, falling back to directories', err)
      }

      let revisions = []
      try {
        revisions = await loadRevisionEntries(repoConnection, revisionDir)
      } catch (err) {
        console.warn('[MaterialLibrary] Failed to load revisions', err)
      }

      if (!usedIndex) {
        const concepts = (await loadConceptEntries(repoConnection, conceptDir)).map((entry) =>
          normalizeMaterialEntry(entry, conceptDir)
        )
        materials = concepts.filter(Boolean)
      } else {
        materials = materials.map((entry) => normalizeMaterialEntry(entry, indexPath)).filter(Boolean)
      }

      materials = attachLatestRevision(materials, revisions)

      const normalized = materials

      entries.value = normalized
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

  if (repoConnection?.on) {
    repoConnection.on('fs:write', () => {
      reload()
    })
    repoConnection.on('fs:directoryNeedsRefresh', ({ path } = {}) => {
      if (typeof path === 'string' && path.includes('/vocab/')) {
        reload()
      }
    })
  }

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

async function loadRevisionEntries(repoConnection, revisionDir) {
  if (!repoConnection?.directoryHandle?.value || !repoConnection.listDir) return []
  const entries = await repoConnection.listDir(revisionDir)
  const files = entries.filter((entry) => entry.kind === 'file' && entry.name.endsWith('.yaml'))
  const loaded = []
  for (const file of files) {
    try {
      const text = await repoConnection.readFile(file.path)
      const parsed = YAML.parse(text) || {}
      loaded.push(parsed)
    } catch (err) {
      console.warn('[MaterialLibrary] Failed to read revision', file.path, err)
    }
  }
  return loaded
}

async function loadConceptEntries(repoConnection, dir, { optional = true } = {}) {
  if (!repoConnection?.directoryHandle?.value || !repoConnection.listDir) return []
  try {
    const entries = await repoConnection.listDir(dir)
    const files = entries.filter((entry) => entry.kind === 'file' && entry.name.endsWith('.yaml'))
    const loaded = []
    for (const file of files) {
      try {
        const text = await repoConnection.readFile(file.path)
        const parsed = YAML.parse(text) || {}
        loaded.push(parsed)
      } catch (err) {
        console.warn('[MaterialLibrary] Failed to read material file', file.path, err)
      }
    }
    return loaded
  } catch (err) {
    if (optional) return []
    throw err
  }
}

async function loadMaterialIndex(repoConnection, path) {
  if (!repoConnection?.readFile) return []
  try {
    const payload = await repoConnection.readFile(path)
    if (!payload) return []
    return JSON.parse(payload) || []
  } catch (err) {
    const message = err?.message || ''
    if (message.includes('ENOENT') || message.includes('NotFoundError')) {
      return []
    }
    throw err
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
