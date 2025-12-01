import { resolveRelationship, expandGraphNeighbors, getNodesByType, getNode } from './graphHelpers'

export function createGraphApi(snapshot = {}) {
  const base = {
    nodes: snapshot.nodes || [],
    nodesById: snapshot.nodesById || {},
    nodesByPath: snapshot.nodesByPath || {},
    nodesByType: snapshot.nodesByType || {},
    relationships: snapshot.relationships || {},
    stats: snapshot.stats || { total: 0, biology: { totalEntities: 0, domains: {}, roles: {}, ontologies: {} } }
  }

  return {
    ...base,
    getNode: (nodeId) => getNode(base, nodeId),
    getNodesByType: (recordType) => getNodesByType(base, recordType),
    resolveRelationship: (nodeOrId, relationshipPath) => resolveRelationship(base, nodeOrId, relationshipPath),
    expandNeighbors: (nodeOrId, options) => expandGraphNeighbors(base, nodeOrId, options)
  }
}
