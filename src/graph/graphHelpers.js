function normalizeNode(graph, nodeOrId) {
  if (!graph || !nodeOrId) return null
  if (typeof nodeOrId === 'string') {
    return graph.nodesById?.[nodeOrId] || null
  }
  if (typeof nodeOrId === 'object' && nodeOrId.id) {
    return graph.nodesById?.[nodeOrId.id] || nodeOrId
  }
  return null
}

function collectEdges(node, relationshipPath) {
  if (!node) return []
  if (!relationshipPath) {
    return ['parents', 'children', 'related']
      .flatMap((group) => node[group] || [])
      .filter(Boolean)
  }
  const segments = relationshipPath.split('.')
  const group = segments[0]
  if (!group) return []
  if (group === 'backlinks') {
    const backlinkGroup = segments[1]
    if (!backlinkGroup) return []
    const relName = segments[2]
    const edges = node.backlinks?.[backlinkGroup] || []
    if (!relName) return edges
    return edges.filter((edge) => edge.relName === relName)
  }
  const relName = segments[1]
  const edges = node[group] || []
  if (!relName) return edges
  return edges.filter((edge) => edge.relName === relName)
}

function edgeTargets(graph, edges) {
  return edges
    .map((edge) => edge.targetNode || (edge.targetId ? graph.nodesById?.[edge.targetId] : null))
    .filter(Boolean)
}

export function resolveRelationship(graph, nodeOrId, relationshipPath) {
  const node = normalizeNode(graph, nodeOrId)
  if (!node) return []
  const edges = collectEdges(node, relationshipPath)
  return edgeTargets(graph, edges)
}

export function expandGraphNeighbors(graph, nodeOrId, options = {}) {
  const node = normalizeNode(graph, nodeOrId)
  if (!node) return []
  const depth = typeof options.depth === 'number' && options.depth > 0 ? Math.floor(options.depth) : 1
  const relationshipPaths = options.relationships && options.relationships.length ? options.relationships : null
  const seen = new Set([node.id])
  const results = new Map()
  const queue = [{ node, depth: 0 }]

  while (queue.length) {
    const current = queue.shift()
    if (current.depth >= depth) continue
    const nextDepth = current.depth + 1
    const targets = relationshipPaths
      ? relationshipPaths.flatMap((path) => resolveRelationship(graph, current.node, path))
      : edgeTargets(graph, collectEdges(current.node))
    for (const neighbor of targets) {
      if (!neighbor || seen.has(neighbor.id)) continue
      seen.add(neighbor.id)
      results.set(neighbor.id, neighbor)
      if (nextDepth < depth) {
        queue.push({ node: neighbor, depth: nextDepth })
      }
    }
  }

  return Array.from(results.values())
}

export function getNodesByType(graph, recordType) {
  if (!graph || !recordType) return []
  return graph.nodesByType?.[recordType] || []
}

export function getNode(graph, nodeId) {
  if (!graph || !nodeId) return null
  return graph.nodesById?.[nodeId] || null
}
