import YAML from 'yaml'
import { ensureMaterialId } from '../plate-editor/utils/materialId'

const VOCAB_DIR = '/vocab'

function defaultVocab(name, { missing = false } = {}) {
  const vocab = {
    name,
    cached_terms: [],
    local_extensions: []
  }
  Object.defineProperty(vocab, '__missing', {
    value: missing,
    enumerable: false,
    configurable: true
  })
  return vocab
}

function vocabPath(name) {
  return `${VOCAB_DIR}/${name}.yaml`
}

function normalizeTerm(term) {
  if (!term) return null
  if (typeof term === 'string') {
    return { id: term, label: term, cached_at: new Date().toISOString() }
  }
  const { id, label, cached_at } = term
  if (!id && !label) return null
  return {
    ...term,
    id: id || label,
    label: label || id,
    cached_at: cached_at || new Date().toISOString()
  }
}

export function createVocabStore(repoConnection) {
  async function readVocab(name) {
    if (!name) throw new Error('Vocab name is required')
    if (name === 'materials') {
      return readMaterialsVocab()
    }
    try {
      const payload = await repoConnection.readFile(vocabPath(name))
      const parsed = YAML.parse(payload) || {}
      return hydrateVocab(name, parsed)
    } catch {
      return defaultVocab(name, { missing: true })
    }
  }

  async function writeVocab(name, data) {
    if (!name) throw new Error('Vocab name is required')
    if (name === 'materials.lab' || name === 'materials') {
      throw new Error(
        'DEPRECATED: writeVocab() should not be used for materials. Use writeMaterialConcept/revision instead.'
      )
    }
    const normalized = hydrateVocab(name, data)
    await repoConnection.writeFile(vocabPath(name), YAML.stringify(normalized))
    return normalized
  }

  function hydrateVocab(name, data = {}) {
    const arrayEntries = Array.isArray(data) ? data : []
    const base = defaultVocab(name)
    const hydrated = {
      ...base,
      ...(Array.isArray(data) ? {} : data),
      name: (Array.isArray(data) ? '' : data.name) || name,
      cached_terms: Array.isArray(data.cached_terms) ? data.cached_terms : [],
      local_extensions: Array.isArray(data.local_extensions)
        ? data.local_extensions
        : arrayEntries.length
        ? arrayEntries
        : []
    }
    Object.defineProperty(hydrated, '__missing', {
      value: false,
      enumerable: false,
      configurable: true
    })
    return hydrated
  }

  function isCacheExpired(entry, maxAgeDays = 30) {
    if (!entry?.cached_at) return true
    const cached = new Date(entry.cached_at)
    if (Number.isNaN(cached.getTime())) return true
    const ageMs = Date.now() - cached.getTime()
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
    return ageMs > maxAgeMs
  }

  async function upsertCachedTerm(name, term, { maxAgeDays = 30 } = {}) {
    if (!term?.id) return
    const vocab = await readVocab(name)
    const normalized = normalizeTerm(term)
    if (!normalized) return
    const existingIndex = vocab.cached_terms.findIndex((entry) => entry.id === normalized.id)
    if (existingIndex >= 0) {
      vocab.cached_terms.splice(existingIndex, 1, normalized)
    } else {
      vocab.cached_terms.push(normalized)
    }
    return writeVocab(name, vocab)
  }

  async function addLocalTerm(name, term) {
    if (!term?.id) throw new Error('Local term requires an id')
    const vocab = await readVocab(name)
    const exists = vocab.local_extensions.some((entry) => entry.id === term.id)
    if (exists) {
      throw new Error(`Local term ${term.id} already exists in ${name}`)
    }
    vocab.local_extensions.push({ ...term })
    return writeVocab(name, vocab)
  }

  function findCachedTerm(vocab, id) {
    return vocab.cached_terms.find((entry) => entry.id === id) || null
  }

  function findLocalTerm(vocab, id) {
    return vocab.local_extensions.find((entry) => entry.id === id) || null
  }

  return {
    readVocab,
    writeVocab,
    upsertCachedTerm,
    addLocalTerm,
    isCacheExpired,
    findCachedTerm,
    findLocalTerm,
    vocabPath
  }

  async function readMaterialsVocab() {
    const base = defaultVocab('materials')
    try {
      const entries = await loadMaterialsFromIndexOrDirs()
      base.local_extensions = entries
      Object.defineProperty(base, '__missing', {
        value: false,
        enumerable: false,
        configurable: true
      })
      return base
    } catch {
      return defaultVocab('materials', { missing: true })
    }
  }

  async function loadMaterialsFromIndexOrDirs() {
    // Fast path: index
    try {
      const text = await repoConnection.readFile('/vocab/materials.index.json')
      if (text) {
        const parsed = JSON.parse(text) || []
        return parsed.map(toOntologyEntry).filter(Boolean)
      }
    } catch (err) {
      const msg = err?.message || ''
      const name = err?.name || ''
      if (!(msg.includes('ENOENT') || msg.includes('NotFoundError') || name === 'NotFoundError')) {
        throw err
      }
    }

    // Fallback: scan concept dir
    try {
      const entries = await repoConnection.listDir('/vocab/materials')
      const files = entries.filter((entry) => entry.kind === 'file' && entry.name.endsWith('.yaml'))
      const out = []
      for (const file of files) {
        try {
          const text = await repoConnection.readFile(file.path)
          const parsed = YAML.parse(text) || {}
          const entry = toOntologyEntry(parsed)
          if (entry) out.push(entry)
        } catch {
          // ignore bad file
        }
      }
      return out
    } catch (err) {
      const msg = err?.message || ''
      const name = err?.name || ''
      if (msg.includes('ENOENT') || msg.includes('NotFoundError') || name === 'NotFoundError') {
        return []
      }
      throw err
    }
  }

  function toOntologyEntry(entry = {}) {
    const label = (entry.label || entry.id || '').trim()
    if (!label) return null
    const id = ensureMaterialId(entry.id || label)
    const tags = Array.isArray(entry.tags)
      ? entry.tags.map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : '')).filter(Boolean)
      : []
    return {
      id,
      label,
      source: 'materials',
      tags,
      cached_at: new Date().toISOString()
    }
  }
}
