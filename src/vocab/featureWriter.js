import YAML from 'yaml'
import { slugifyMaterialId } from '../plate-editor/utils/materialId'

function slugifyId(value = '') {
  const normalized = String(value || '').replace(/^feature:/i, '')
  return slugifyMaterialId(normalized)
}

function nextRevisionId(slug, timestamp) {
  return `featurerev:${slug}@${timestamp}`
}

export async function writeFeatureConcept(repo, entry, { timestamp = null } = {}) {
  if (!repo?.writeFile) throw new Error('Repository not connected.')
  const slug = slugifyId(entry.label || entry.id)
  const featureId = `feature:${slug}`
  const filePath = `/vocab/features/feature--${slug}.yaml`
  await assertFileDoesNotExist(repo, filePath, 'Feature concept already exists; labels must be unique.')
  const concept = {
    id: featureId,
    label: entry.label,
    description: entry.description || '',
    tags: entry.tags || [],
    created_at: entry.created_at || timestamp
  }
  const doc = new YAML.Document(concept)
  await repo.writeFile(filePath, doc.toString({ lineWidth: 0 }))
  return { filePath, concept }
}

export async function writeFeatureRevision(repo, entry, { timestamp = null, createdBy = 'system' } = {}) {
  if (!repo?.writeFile) throw new Error('Repository not connected.')
  const slug = slugifyId(entry.label || entry.id)
  const featureId = `feature:${slug}`
  const ts = timestamp || new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z')
  const revId = nextRevisionId(slug, ts)
  const fileName = `featurerev--${slug}--${ts}.yaml`
  const filePath = `/vocab/feature-revisions/${fileName}`
  await assertFileDoesNotExist(repo, filePath, 'Feature revision already exists with this timestamp.')
  const revision = buildRevisionPayload({
    id: revId,
    of_feature: featureId,
    createdBy,
    timestamp: entry.created_at || timestamp,
    entry
  })
  const doc = new YAML.Document(revision)
  await repo.writeFile(filePath, doc.toString({ lineWidth: 0 }))
  return { filePath, revision }
}

export async function rebuildFeatureIndex(repo) {
  if (!repo?.listDir || !repo?.readFile || !repo?.writeFile) return
  const concepts = await readConcepts(repo, '/vocab/features')
  const revisions = await readRevisions(repo, '/vocab/feature-revisions')
  const index = concepts.map((concept) => {
    const latest = resolveLatestRevision(revisions, concept.id)
    return {
      id: concept.id,
      label: concept.label,
      description: concept.description || '',
      tags: concept.tags || [],
      latest_revision_id: latest?.id || '',
      latest_revision_status: latest?.status || '',
      latest_revision: latest || null
    }
  })
  const out = JSON.stringify(index, null, 2)
  await repo.writeFile('/vocab/features.index.json', out)
  return index
}

async function readConcepts(repo, dir) {
  try {
    const entries = await repo.listDir(dir)
    const files = entries.filter((e) => e.kind === 'file' && e.name.endsWith('.yaml'))
    const out = []
    for (const file of files) {
      const text = await repo.readFile(file.path)
      const parsed = YAML.parse(text) || {}
      out.push(parsed)
    }
    return out
  } catch {
    return []
  }
}

async function readRevisions(repo, dir) {
  try {
    const entries = await repo.listDir(dir)
    const files = entries.filter((e) => e.kind === 'file' && e.name.endsWith('.yaml'))
    const out = []
    for (const file of files) {
      const text = await repo.readFile(file.path)
      const parsed = YAML.parse(text) || {}
      out.push(parsed)
    }
    return out
  } catch {
    return []
  }
}

function resolveLatestRevision(revisions = [], featureId = '') {
  const matches = revisions.filter((rev) => rev?.of_feature === featureId && rev?.status === 'active')
  if (!matches.length) return null
  return matches.sort((a, b) => {
    const revA = Number(a.revision) || 0
    const revB = Number(b.revision) || 0
    if (revA !== revB) return revB - revA
    const tsA = Date.parse(a.created_at || '') || 0
    const tsB = Date.parse(b.created_at || '') || 0
    return tsB - tsA
  })[0]
}

async function assertFileDoesNotExist(repo, path, message) {
  if (!repo?.readFile) return
  try {
    await repo.readFile(path)
    throw new Error(message || `File already exists at ${path}`)
  } catch (err) {
    const msg = err?.message || ''
    const name = err?.name || ''
    if (msg.includes('ENOENT') || msg.includes('NotFoundError') || name === 'NotFoundError') {
      return
    }
    throw err
  }
}

function buildRevisionPayload({ id, of_feature, createdBy, timestamp, entry }) {
  const revision = {
    id,
    of_feature,
    revision: entry.revision || 1,
    status: entry.status || 'active',
    created_at: timestamp || new Date().toISOString(),
    created_by: createdBy,
    changes_summary: entry.changes_summary || 'New feature revision',
    label: entry.label
  }

  if (entry.description) {
    revision.description = entry.description
  }
  if (Array.isArray(entry.tags) && entry.tags.length) {
    revision.tags = entry.tags
  }
  if (entry.modality) {
    revision.modality = entry.modality
  }
  if (entry.units) {
    revision.units = entry.units
  }
  if (entry.ontology && typeof entry.ontology === 'object' && Object.keys(entry.ontology).length) {
    revision.ontology = entry.ontology
  }

  return revision
}
