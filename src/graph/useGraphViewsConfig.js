import { computed } from 'vue'

export function useGraphViewsConfig(schemaLoader) {
  const bundleViews = computed(() => schemaLoader.schemaBundle?.value?.graphViews || {})
  const views = computed(() => bundleViews.value?.views || {})

  const defaultViewMap = computed(() => {
    const map = new Map()
    Object.entries(views.value).forEach(([viewId, viewConfig]) => {
      if (!viewConfig || !viewConfig.rootType) return
      const targets = []
      if (Array.isArray(viewConfig.defaultFor)) {
        targets.push(...viewConfig.defaultFor)
      }
      if (viewConfig.default) {
        targets.push(viewConfig.rootType)
      }
      targets.forEach((recordType) => {
        if (!recordType || map.has(recordType)) return
        map.set(recordType, viewId)
      })
    })
    return map
  })

  function getView(viewId) {
    if (!viewId) return null
    return views.value?.[viewId] || null
  }

  function getDefaultForType(recordType) {
    if (!recordType) return null
    const mapped = defaultViewMap.value.get(recordType)
    if (mapped) {
      return getView(mapped)
    }
    const fallback = Object.values(views.value).find((view) => view?.rootType === recordType)
    return fallback || null
  }

  return {
    views,
    getView,
    getDefaultForType,
    defaultViewMap
  }
}
