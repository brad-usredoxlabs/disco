import YAML from 'yaml'
import { slugifyMaterialId } from '../plate-editor/utils/materialId'

function slugifyId(value = '') {
  const normalized = String(value || '').replace(/^material:/i, '')
  return slugifyMaterialId(normalized)
}

function nextRevisionId(slug, timestamp) {
  return `materialrev:${slug}@${timestamp}`
}

export async function writeMaterialConcept(repo, entry, { timestamp = null } = {}) {
  if (!repo?.writeFile) throw new Error('Repository not connected.')
  const slug = slugifyId(entry.label || entry.id)
  const materialId = `material:${slug}`
  const filePath = `/vocab/materials/material--${slug}.yaml`
  assertNotLegacyPath(filePath)
  await assertFileDoesNotExist(repo, filePath, 'Material concept already exists; labels must be unique.')
  const concept = {
    id: materialId,
    label: entry.label,
    category: entry.category,
    tags: entry.tags || [],
    xref: entry.xref || {},
    aliases: entry.aliases || [],
    created_at: entry.created_at || timestamp
  }
  const doc = new YAML.Document(concept)
  await repo.writeFile(filePath, doc.toString({ lineWidth: 0 }))
  return { filePath, concept }
}

export async function writeMaterialRevision(repo, entry, { timestamp = null, createdBy = 'system' } = {}) {
  if (!repo?.writeFile) throw new Error('Repository not connected.')
  const slug = slugifyId(entry.label || entry.id)
  const materialId = `material:${slug}`
  const ts = timestamp || new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z')
  const revId = nextRevisionId(slug, ts)
  const fileName = `materialrev--${slug}--${ts}.yaml`
  const filePath = `/vocab/material-revisions/${fileName}`
  assertNotLegacyPath(filePath)
  await assertFileDoesNotExist(repo, filePath, 'Material revision already exists with this timestamp.')
  const revision = buildRevisionPayload({
    id: revId,
    of_material: materialId,
    createdBy,
    timestamp: entry.created_at || timestamp,
    entry
  })
  const doc = new YAML.Document(revision)
  await repo.writeFile(filePath, doc.toString({ lineWidth: 0 }))
  return { filePath, revision }
}

export async function rebuildMaterialsIndex(repo) {
  if (!repo?.listDir || !repo?.readFile || !repo?.writeFile) return
  const concepts = await readConcepts(repo, '/vocab/materials')
  const revisions = await readRevisions(repo, '/vocab/material-revisions')
  const index = concepts.map((concept) => {
    const latest = resolveLatestRevision(revisions, concept.id)
    return {
      id: concept.id,
      label: concept.label,
      category: concept.category,
      tags: concept.tags || [],
      latest_revision_id: latest?.id || '',
      latest_revision_status: latest?.status || '',
      latest_revision: latest || null
    }
  })
  const out = JSON.stringify(index, null, 2)
  await repo.writeFile('/vocab/materials.index.json', out)
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

function resolveLatestRevision(revisions = [], materialId = '') {
  const matches = revisions.filter((rev) => rev?.of_material === materialId && rev?.status === 'active')
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

function assertNotLegacyPath(path = '') {
  if (!path) return
  if (/materials\.lab\.yaml$/i.test(path)) {
    throw new Error('FATAL: Attempted to write to deprecated materials.lab.yaml')
  }
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
    // If read failed for reasons other than not-found, rethrow
    throw err
  }
}

function buildRevisionPayload({ id, of_material, createdBy, timestamp, entry }) {
  const revision = {
    id,
    of_material,
    revision: entry.revision || 1,
    status: entry.status || 'active',
    created_at: timestamp || new Date().toISOString(),
    created_by: createdBy,
    changes_summary: entry.changes_summary || 'New revision',
    label: entry.label,
    category: entry.category
  }

  if (Array.isArray(entry.experimental_intents) && entry.experimental_intents.length) {
    revision.experimental_intents = entry.experimental_intents
  }
  if (Array.isArray(entry.tags) && entry.tags.length) {
    revision.tags = entry.tags
  }
  if (entry.xref && typeof entry.xref === 'object' && Object.keys(entry.xref).length) {
    revision.xref = entry.xref
  }
  if (Array.isArray(entry.aliases) && entry.aliases.length) {
    revision.aliases = entry.aliases
  }
  if (Array.isArray(entry.classified_as) && entry.classified_as.length) {
    revision.classified_as = entry.classified_as
  }
  if (entry.mechanism && typeof entry.mechanism === 'object') {
    const { type, targets } = entry.mechanism
    const hasType = typeof type === 'string' && type.trim()
    const hasTargets = Array.isArray(targets) && targets.length
    if (hasType || hasTargets) {
      revision.mechanism = {
        ...(hasType ? { type } : {}),
        ...(hasTargets ? { targets } : {})
      }
    }
  }
  if (Array.isArray(entry.affected_processes) && entry.affected_processes.length) {
    revision.affected_processes = entry.affected_processes
    revision.affected_process = entry.affected_processes[0]
  } else if (entry.affected_process && typeof entry.affected_process === 'object' && Object.keys(entry.affected_process).length) {
    revision.affected_process = entry.affected_process
  }
  if (Array.isArray(entry.measures) && entry.measures.length) {
    revision.measures = entry.measures
  }
  if (entry.detection && typeof entry.detection === 'object') {
    const detection = {}
    const { modality, channel_hint, excitation_nm, emission_nm } = entry.detection
    if (modality) detection.modality = modality
    if (channel_hint) detection.channel_hint = channel_hint
    if (Number.isFinite(excitation_nm)) detection.excitation_nm = excitation_nm
    if (Number.isFinite(emission_nm)) detection.emission_nm = emission_nm
    if (Object.keys(detection).length) {
      revision.detection = detection
    }
  }
  if (entry.control_role) {
    revision.control_role = entry.control_role
  }
  if (entry.control_for && typeof entry.control_for === 'object') {
    const controlFor = {}
    if (Array.isArray(entry.control_for.features) && entry.control_for.features.length) {
      controlFor.features = entry.control_for.features
    }
    if (
      Array.isArray(entry.control_for.acquisition_modalities) &&
      entry.control_for.acquisition_modalities.length
    ) {
      controlFor.acquisition_modalities = entry.control_for.acquisition_modalities
    }
    if (entry.control_for.notes) {
      controlFor.notes = entry.control_for.notes
    }
    if (Object.keys(controlFor).length) {
      revision.control_for = controlFor
    }
  }

  return revision
}
