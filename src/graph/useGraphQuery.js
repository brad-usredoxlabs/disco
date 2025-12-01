import { computed, unref } from 'vue'
import { useGraphQueriesConfig } from './useGraphQueriesConfig'

function buildSource(node) {
  const frontMatter = node?.frontMatter || {}
  return {
    ...frontMatter,
    metadata: frontMatter,
    data: frontMatter
  }
}

function readPathValues(source, path) {
  if (!path || !source) return []
  const segments = path.split('.').filter(Boolean)
  return traverseSegments(source, segments)
}

function traverseSegments(value, segments) {
  if (!segments.length) {
    return [value]
  }
  const [segment, ...rest] = segments
  const isArraySegment = segment.endsWith('[]')
  const key = isArraySegment ? segment.slice(0, -2) : segment
  const values = Array.isArray(value) ? value : [value]
  const results = []
  values.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const nextValue = entry[key]
    if (nextValue === undefined) return
    if (isArraySegment) {
      const arrayValue = Array.isArray(nextValue) ? nextValue : [nextValue]
      arrayValue.forEach((child) => {
        results.push(...traverseSegments(child, rest))
      })
    } else {
      results.push(...traverseSegments(nextValue, rest))
    }
  })
  return results
}

function toComparable(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    return value['@id'] || value.id || value.identifier || JSON.stringify(value)
  }
  return String(value)
}

function matchesOperator(value, needle, operator = 'equals') {
  const candidate = toComparable(value)
  const target = toComparable(needle)
  if (!candidate && !target) return false
  switch (operator) {
    case 'contains':
      return candidate.toLowerCase().includes(target.toLowerCase())
    case 'equals':
    default:
      return candidate === target
  }
}

function evaluateFilter(node, filterConfig, filterValue) {
  if (!filterConfig) return true
  const values = readPathValues(buildSource(node), filterConfig.path)
  if (!values.length) return false
  const needles = Array.isArray(filterValue) ? filterValue : [filterValue]
  return values.some((value) => needles.some((needle) => matchesOperator(value, needle, filterConfig.operator)))
}

function groupNodes(nodes, groupBy) {
  if (!groupBy) {
    return [{ id: 'all', label: 'All results', nodes }]
  }
  const groups = new Map()
  nodes.forEach((node) => {
    const keyValue =
      groupBy === 'recordType' ? node.recordType : node[groupBy] || node.frontMatter?.[groupBy] || 'other'
    const key = keyValue || 'other'
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(node)
  })
  return Array.from(groups.entries()).map(([key, groupedNodes]) => ({
    id: key,
    label: key,
    nodes: groupedNodes
  }))
}

export function useGraphQuery(options = {}) {
  const { graph, schemaLoader, queryId, filterValue } = options
  const configs = useGraphQueriesConfig(schemaLoader)

  const resolvedQueryId = computed(() => unref(queryId) || '')

  const queryConfig = computed(() => {
    const id = resolvedQueryId.value
    if (!id) return null
    return configs.getQuery(id)
  })

  const matches = computed(() => {
    const graphValue = unref(graph)
    const query = queryConfig.value
    const value = unref(filterValue)
    if (!graphValue || !query || (query.filter && (value === undefined || value === null || value === ''))) {
      return []
    }
    const nodes = graphValue.nodes || []
    if (!query.filter) return nodes
    return nodes.filter((node) => evaluateFilter(node, query.filter, value))
  })

  const groups = computed(() => {
    const query = queryConfig.value
    if (!query) return []
    return groupNodes(matches.value, query.groupBy)
  })

  const expandedNeighbors = computed(() => {
    const graphValue = unref(graph)
    const query = queryConfig.value
    if (!graphValue?.expandNeighbors || !query?.expand) return new Map()
    const config = {
      depth: query.expand.depth,
      relationships: query.expand.relationships
    }
    const map = new Map()
    matches.value.forEach((node) => {
      const neighbors = graphValue.expandNeighbors(node, config) || []
      map.set(node.id, neighbors)
    })
    return map
  })

  return {
    queryId: resolvedQueryId,
    query: queryConfig,
    matches,
    groups,
    expandedNeighbors
  }
}
