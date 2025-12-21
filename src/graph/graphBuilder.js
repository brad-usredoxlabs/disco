import { parseFrontMatter } from '../records/frontMatter.js'
import { extractRecordData, mergeMetadataAndFormData } from '../records/jsonLdFrontmatter.js'

export function buildGraphSnapshot(files = [], schemaBundle = {}) {
  const relationships = schemaBundle.relationships || { recordTypes: {} }
  const nodes = []
  const nodesById = {}
  const nodesByPath = {}
  const nodesByType = {}
  const biologyStats = emptyBiologyStats()

  for (const file of files) {
    if (!file?.text?.startsWith?.('---')) continue
    try {
      const { data, body } = parseFrontMatter(file.text)
      const { metadata: hydratedMetadata, formData } = extractRecordData(file.recordType, data, schemaBundle)
      const schemaRecord = mergeMetadataAndFormData(hydratedMetadata, formData)
      const id = schemaRecord?.id || schemaRecord?.recordId
      const resolvedType = schemaRecord?.recordType || file.recordType
      if (!id || resolvedType !== file.recordType) continue

      const biologyEntities = extractBiologyEntities(schemaRecord)
      updateBiologyStats(biologyStats, biologyEntities)
      const semanticTags = extractSemanticTags(schemaRecord)
      const node = {
        id,
        recordType: resolvedType,
        path: file.path,
        title: schemaRecord?.title || id,
        frontMatter: schemaRecord,
        markdown: body || '',
        biologyEntities,
        semanticTags,
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
      if (!nodesByType[resolvedType]) {
        nodesByType[resolvedType] = []
      }
      nodesByType[resolvedType].push(node)
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
        field: link.field,
        recordType: node.recordType,
        targetId: node.id,
        targetNode: node
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
          field: edge.field,
          recordType: node.recordType,
          targetId: node.id,
          targetNode: node
        })
      }
    })
  }

  return {
    nodes,
    nodesById,
    nodesByPath,
    nodesByType,
    relationships,
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

function extractSemanticTags(record = {}) {
  const tags = {
    taxonIds: [],
    anatomyIds: [],
    cellTypeIds: [],
    pathwayIds: [],
    instrumentIds: [],
    reagentIds: [],
    sampleIds: []
  }

  const biology = record?.biology || {}
  const operations = record?.operations || {}
  const addValue = (collection, value) => {
    const id = extractIdentifier(value)
    if (id && !collection.includes(id)) {
      collection.push(id)
    }
  }
  if (biology.taxon) addValue(tags.taxonIds, biology.taxon)
  if (biology.anatomicalContext) addValue(tags.anatomyIds, biology.anatomicalContext)
  ensureArray(biology.cellTypes).forEach((entry) => addValue(tags.cellTypeIds, entry))
  ensureArray(biology.pathways).forEach((entry) => addValue(tags.pathwayIds, entry))
  ensureArray(record.samples).forEach((entry) => addValue(tags.sampleIds, entry))
  ensureArray(record.reagents).forEach((entry) => addValue(tags.reagentIds, entry))
  ensureArray(operations.instruments).forEach((entry) => addValue(tags.instrumentIds, entry))
  return tags
}

function extractIdentifier(entry) {
  if (!entry) return ''
  if (typeof entry === 'string') return entry
  if (typeof entry === 'object') {
    return entry['@id'] || entry.id || entry.identifier || ''
  }
  return ''
}

function ensureArray(value) {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return [value]
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
