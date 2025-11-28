import { parseFrontMatter } from '../records/frontMatter'
import { extractRecordData, mergeMetadataAndFormData } from '../records/jsonLdFrontmatter'

export function buildGraphSnapshot(files = [], schemaBundle = {}) {
  const relationships = schemaBundle.relationships || { recordTypes: {} }
  const nodes = []
  const nodesById = {}
  const nodesByPath = {}
  const biologyStats = emptyBiologyStats()

  for (const file of files) {
    if (!file?.text?.startsWith?.('---')) continue
    try {
      const { data, body } = parseFrontMatter(file.text)
      const { metadata: hydratedMetadata, formData } = extractRecordData(file.recordType, data, schemaBundle)
      const schemaRecord = mergeMetadataAndFormData(hydratedMetadata, formData)
      const id = schemaRecord?.id
      const resolvedType = schemaRecord?.recordType || file.recordType
      if (!id || resolvedType !== file.recordType) continue

      const biologyEntities = extractBiologyEntities(schemaRecord)
      updateBiologyStats(biologyStats, biologyEntities)
      const node = {
        id,
        recordType: resolvedType,
        path: file.path,
        title: schemaRecord?.title || id,
        frontMatter: schemaRecord,
        markdown: body || '',
        biologyEntities,
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
      nodesByPath[file.path] = node
    } catch (err) {
      console.warn('[RecordGraphWorker] Failed to parse record', file.path, err)
    }
  }

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
      total: nodes.length,
      biology: biologyStats
    }
  }
}

function edgeListFor(record, relationshipsConfig) {
  const descriptor = relationshipsConfig?.recordTypes?.[record.recordType] || {}
  function normalizeValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean)
    if (value === undefined || value === null || value === '') return []
    return [value]
  }
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

function extractBiologyEntities(record = {}) {
  const list = record?.biology?.entities
  if (!Array.isArray(list)) return []
  return list
    .map((entry) => ({
      domain: entry?.domain || '',
      role: entry?.role || '',
      ontology: entry?.ontology || '',
      id: entry?.['@id'] || entry?.id || '',
      label: entry?.label || ''
    }))
    .filter((entity) => entity.domain || entity.role || entity.ontology || entity.id || entity.label)
}

function emptyBiologyStats() {
  return {
    totalEntities: 0,
    domains: {},
    roles: {},
    ontologies: {}
  }
}

function updateBiologyStats(stats, entities = []) {
  if (!stats) return
  entities.forEach((entity) => {
    stats.totalEntities += 1
    if (entity.domain) {
      stats.domains[entity.domain] = (stats.domains[entity.domain] || 0) + 1
    }
    if (entity.role) {
      stats.roles[entity.role] = (stats.roles[entity.role] || 0) + 1
    }
    if (entity.ontology) {
      stats.ontologies[entity.ontology] = (stats.ontologies[entity.ontology] || 0) + 1
    }
  })
}
