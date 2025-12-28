import YAML from 'yaml'
import { ensureMaterialId } from '../utils/materialId'

export async function upsertMaterialLibraryEntry(repoConnection, entryInput = {}, options = {}) {
  if (!repoConnection?.readFile || !repoConnection?.writeFile) {
    throw new Error('Repository connection is not ready.')
  }
  const path = options.path
  const normalized = normalizeMaterialLibraryEntry(entryInput)
  if (!path) {
    throw new Error('materialLibraryWriter requires an explicit path; legacy monolith is deprecated.')
  }
  const raw = await safeReadFile(repoConnection, path)
  const doc = raw ? YAML.parseDocument(raw) : new YAML.Document([])
  ensureSequence(doc)
  const seq = doc.contents
  const existingIndex = findEntryIndex(seq, normalized.id)
  const node = doc.createNode(normalized)
  node.spaceBefore = true
  if (existingIndex >= 0) {
    const existingNode = seq.items[existingIndex]
    node.commentBefore = existingNode?.commentBefore
    seq.items.splice(existingIndex, 1, node)
  } else if (options.insert === 'alphabetical') {
    const insertAt = findInsertIndex(seq, normalized.label)
    seq.items.splice(insertAt, 0, node)
  } else {
    seq.items.push(node)
  }
  const output = doc.toString({ lineWidth: 0 })
  await repoConnection.writeFile(path, output)
  return normalized
}

export function normalizeMaterialLibraryEntry(entry = {}) {
  const label = (entry.label || '').trim()
  if (!label) {
    throw new Error('Material label is required.')
  }
  const id = ensureMaterialId(entry.id || label)
  const tags = dedupeStrings(entry.tags || [])
  if (!tags.length) {
    throw new Error('At least one tag is required.')
  }
  const normalized = {
    id,
    label,
    tags
  }
  const synonyms = dedupeStrings(entry.synonyms || [], { preserveCase: true })
  if (synonyms.length) {
    normalized.synonyms = synonyms
  }
  if (entry.measures) {
    normalized.measures = String(entry.measures).trim()
  }
  if (Array.isArray(entry.classified_as)) {
    const list = entry.classified_as
      .map((item) => normalizeClassification(item))
      .filter(Boolean)
    if (list.length) {
      normalized.classified_as = list
    }
  }
  const defaults = normalizeDefaults(entry.defaults)
  if (Object.keys(defaults).length) {
    normalized.defaults = defaults
  }
  const mechanism = normalizeMechanism(entry.mechanism)
  if (mechanism) {
    normalized.mechanism = mechanism
  }
  const affectedProcess = normalizeSimpleTerm(entry.affected_process)
  if (affectedProcess) {
    normalized.affected_process = affectedProcess
  }
  const xref = normalizeXref(entry.xref)
  if (Object.keys(xref).length) {
    normalized.xref = xref
  }
  return normalized
}

async function safeReadFile(repoConnection, path) {
  try {
    return await repoConnection.readFile(path)
  } catch (err) {
    const message = err?.message || ''
    if (message.includes('ENOENT') || message.includes('NotFoundError')) {
      return ''
    }
    throw err
  }
}

function ensureSequence(doc) {
  if (doc.contents && Array.isArray(doc.contents.items)) {
    return
  }
  const seq = doc.createNode([])
  seq.flow = false
  doc.contents = seq
}

function findEntryIndex(seq, id) {
  if (!seq?.items?.length) return -1
  return seq.items.findIndex((node) => readScalar(node, 'id') === id)
}

function findInsertIndex(seq, label = '') {
  const reference = (label || '').toLowerCase()
  if (!seq?.items?.length) return 0
  for (let index = 0; index < seq.items.length; index += 1) {
    const existingLabel = (readScalar(seq.items[index], 'label') || '').toLowerCase()
    if (!existingLabel) continue
    if (reference.localeCompare(existingLabel) < 0) {
      return index
    }
  }
  return seq.items.length
}

function readScalar(node, key) {
  if (!node?.items) return undefined
  const pair = node.items.find((item) => item?.key?.value === key)
  if (!pair) return undefined
  return pair.value?.value
}

function normalizeDefaults(defaults = {}) {
  if (!defaults || typeof defaults !== 'object') return {}
  const normalized = {}
  if (defaults.role && typeof defaults.role === 'string') {
    normalized.role = defaults.role.trim()
  }
  if (defaults.amount && typeof defaults.amount === 'object') {
    const amount = normalizeAmount(defaults.amount)
    if (amount) normalized.amount = amount
  }
  return normalized
}

function normalizeAmount(amount = {}) {
  if (amount === null || typeof amount !== 'object') return null
  const value = Number(amount.value)
  const unit = typeof amount.unit === 'string' ? amount.unit.trim() : ''
  if (!Number.isFinite(value) || !unit) return null
  return { value, unit }
}

function normalizeMechanism(mechanism = {}) {
  if (!mechanism || typeof mechanism !== 'object') return null
  const type = typeof mechanism.type === 'string' ? mechanism.type.trim() : ''
  const target = mechanism.target || {}
  const targetId = typeof target.id === 'string' ? target.id.trim() : ''
  const targetLabel = typeof target.label === 'string' ? target.label.trim() : ''
  if (!type || !targetId || !targetLabel) return null
  return {
    type,
    target: {
      id: targetId,
      label: targetLabel
    }
  }
}

function normalizeSimpleTerm(term = {}) {
  if (!term || typeof term !== 'object') return null
  const id = typeof term.id === 'string' ? term.id.trim() : ''
  const label = typeof term.label === 'string' ? term.label.trim() : ''
  if (!id || !label) return null
  return { id, label }
}

function normalizeClassification(entry = {}) {
  if (!entry || typeof entry !== 'object') return null
  const id = typeof entry.id === 'string' ? entry.id.trim() : ''
  const label = typeof entry.label === 'string' ? entry.label.trim() : ''
  const domain = typeof entry.domain === 'string' ? entry.domain.trim() : ''
  const role = typeof entry.role === 'string' ? entry.role.trim() : ''
  if (!id || !label || !domain || !role) return null
  return { id, label, domain, role }
}

function normalizeXref(xref = {}) {
  if (!xref || typeof xref !== 'object') return {}
  const normalized = {}
  Object.entries(xref).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) {
      normalized[key] = value.trim()
    }
  })
  return normalized
}

function dedupeStrings(list = [], options = {}) {
  if (!Array.isArray(list)) return []
  const preserveCase = Boolean(options.preserveCase)
  const seen = new Set()
  const bucket = []
  list.forEach((value) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    const token = preserveCase ? trimmed.toLowerCase() : trimmed.toLowerCase()
    if (seen.has(token)) return
    seen.add(token)
    bucket.push(preserveCase ? trimmed : trimmed.toLowerCase())
  })
  return bucket
}
