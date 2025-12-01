import { computed, unref } from 'vue'
import { useGraphViewsConfig } from './useGraphViewsConfig'

function resolveViewId(viewIdRef, recordType, configs) {
  const explicit = unref(viewIdRef)
  if (explicit) return explicit
  if (!recordType) return ''
  const defaultMap = configs.defaultViewMap.value
  if (defaultMap?.has(recordType)) {
    return defaultMap.get(recordType)
  }
  const entries = Object.entries(configs.views.value || {})
  const fallback = entries.find(([, config]) => config?.rootType === recordType)
  return fallback ? fallback[0] : ''
}

function resolveEdgeSource(edgeConfig = {}, rootNode) {
  const from = edgeConfig.from || 'root'
  if (from === 'root') {
    return rootNode
  }
  return rootNode
}

export function useGraphView(options = {}) {
  const { graph, schemaLoader, rootId, recordType, viewId } = options
  const configs = useGraphViewsConfig(schemaLoader)

  const resolvedViewId = computed(() => {
    const type = unref(recordType) || ''
    return resolveViewId(viewId, type, configs)
  })

  const resolvedView = computed(() => {
    const id = resolvedViewId.value
    if (!id) return null
    return configs.getView(id)
  })

  const rootNode = computed(() => {
    const graphValue = unref(graph)
    const id = unref(rootId)
    if (!graphValue || !graphValue.getNode || !id) return null
    return graphValue.getNode(id)
  })

  const sections = computed(() => {
    const view = resolvedView.value
    const root = rootNode.value
    const graphValue = unref(graph)
    if (!view || !root || !graphValue?.resolveRelationship) return []
    return (view.sections || []).map((section) => {
      const entries = (section.edges || []).map((edgeConfig) => {
        const sourceNode = resolveEdgeSource(edgeConfig, root)
        const nodes = sourceNode ? graphValue.resolveRelationship(sourceNode, edgeConfig.relationship) : []
        return {
          id: `${section.id || 'section'}:${edgeConfig.relationship || 'all'}`,
          config: edgeConfig,
          nodes,
          sourceNode
        }
      })
      return {
        id: section.id || 'section',
        label: section.label || section.id || '',
        entries
      }
    })
  })

  const viewModel = computed(() => {
    const view = resolvedView.value
    if (!view) return null
    return {
      id: resolvedViewId.value,
      label: view.label || view.rootType || resolvedViewId.value,
      rootType: view.rootType,
      rootNode: rootNode.value,
      sections: sections.value
    }
  })

  return {
    view: viewModel,
    viewId: resolvedViewId,
    rootNode,
    sections
  }
}
