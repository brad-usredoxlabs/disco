import { parseFrontMatter } from '../records/frontMatter'
import { extractRecordData, mergeMetadataAndFormData } from '../records/jsonLdFrontmatter'

function normalizeDir(input = '') {
  if (!input) return null
  const cleaned = input.replace(/^\/+|\/+$/g, '')
  return cleaned ? `/${cleaned}` : null
}

function ensureCandidates(baseDir) {
  const normalized = normalizeDir(baseDir)
  if (!normalized) return []
  return [normalized, normalizeDir(`records/${normalized.replace(/^\//, '')}`)].filter(Boolean)
}

async function dirExists(repoConnection, path) {
  if (!path) return false
  try {
    await repoConnection.listDir(path)
    return true
  } catch (err) {
    return false
  }
}

async function collectFiles(repoConnection, baseDir) {
  const files = []
  const seen = new Set()

  async function walk(path) {
    if (seen.has(path)) return
    seen.add(path)
    let entries
    try {
      entries = await repoConnection.listDir(path)
    } catch (err) {
      return
    }
    for (const entry of entries) {
      if (entry.kind === 'directory') {
        await walk(entry.path)
      } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        files.push(entry.path)
      }
    }
  }

  const candidates = ensureCandidates(baseDir)
  for (const candidate of candidates) {
    if (await dirExists(repoConnection, candidate)) {
      await walk(candidate)
    }
  }

  return files
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (value === undefined || value === null || value === '') return []
  return [value]
}

function edgeListFor(record, relationshipsConfig) {
  const descriptor = relationshipsConfig?.recordTypes?.[record.recordType] || {}
  function mapEdges(group) {
    const rels = descriptor[group]
    if (!rels) return []
    const edges = []
    for (const [relName, relConfig] of Object.entries(rels)) {
      const values = normalizeValue(record.frontMatter?.[relConfig.field])
      for (const targetId of values) {
        edges.push({
          relName,
          field: relConfig.field,
          targetId,
          recordType: relConfig.recordType,
          cardinality: relConfig.cardinality
        })
      }
    }
    return edges
  }
  return {
    parents: mapEdges('parents'),
    children: mapEdges('children'),
    related: mapEdges('related')
  }
}

export async function buildRecordGraph(repoConnection, schemaBundle) {
  if (!schemaBundle) {
    return {
      nodesById: {},
      nodesByPath: {},
      nodes: [],
      stats: { total: 0 }
    }
  }

  const naming = schemaBundle.naming || {}
  const relationships = schemaBundle.relationships || { recordTypes: {} }
  const nodesById = {}
  const nodesByPath = {}
  const nodes = []

  for (const [recordType, namingRule] of Object.entries(naming)) {
    const files = await collectFiles(repoConnection, namingRule?.baseDir)
    for (const path of files) {
      if (nodesByPath[path]) continue
      try {
        const text = await repoConnection.readFile(path)
        if (!text?.startsWith('---')) continue
        const { data, body } = parseFrontMatter(text)
        const { metadata: hydratedMetadata, formData } = extractRecordData(recordType, data, schemaBundle)
        const schemaRecord = mergeMetadataAndFormData(hydratedMetadata, formData)
        const id = schemaRecord?.id
        const resolvedType = schemaRecord?.recordType || recordType
        if (!id || resolvedType !== recordType) {
          continue
        }
        const node = {
          id,
          recordType,
          path,
          title: schemaRecord?.title || id,
          frontMatter: schemaRecord,
          markdown: body || '',
          parents: [],
          children: [],
          related: [],
          backlinks: {
            parents: [],
            children: [],
            related: []
          }
        }
        nodes.push(node)
        nodesById[id] = node
        nodesByPath[path] = node
      } catch (err) {
        console.warn('[RecordGraph] Failed to read record', path, err)
      }
    }
  }

  // build edges
  for (const node of nodes) {
    const edges = edgeListFor(node, relationships)
    const attachTarget = (edge) => {
      edge.targetNode = nodesById[edge.targetId] || null
    }
    edges.parents.forEach(attachTarget)
    edges.children.forEach(attachTarget)
    edges.related.forEach(attachTarget)
    node.parents.push(...edges.parents)
    node.children.push(...edges.children)
    node.related.push(...edges.related)
  }

  // backlinks
  for (const node of nodes) {
    const addBacklink = (targetId, type, link) => {
      const targetNode = nodesById[targetId]
      if (!targetNode) return
      targetNode.backlinks[type] ||= []
      targetNode.backlinks[type].push({
        fromId: node.id,
        fromType: node.recordType,
        relName: link.relName,
        field: link.field
      })
    }

    node.parents.forEach((edge) => addBacklink(edge.targetId, 'children', edge))
    node.children.forEach((edge) => addBacklink(edge.targetId, 'parents', edge))
    node.related.forEach((edge) => {
      addBacklink(edge.targetId, 'related', edge)
      const reciprocal = nodesById[edge.targetId]
      if (reciprocal) {
        reciprocal.backlinks.related ||= []
        reciprocal.backlinks.related.push({
          fromId: node.id,
          fromType: node.recordType,
          relName: edge.relName,
          field: edge.field
        })
      }
    })
  }

  return {
    nodes,
    nodesById,
    nodesByPath,
    stats: {
      total: nodes.length
    }
  }
}
