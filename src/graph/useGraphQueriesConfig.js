import { computed } from 'vue'

export function useGraphQueriesConfig(schemaLoader) {
  const bundleQueries = computed(() => schemaLoader.schemaBundle?.value?.graphQueries || {})
  const queries = computed(() => bundleQueries.value?.queries || {})

  function getQuery(queryId) {
    if (!queryId) return null
    return queries.value?.[queryId] || null
  }

  const queryList = computed(() =>
    Object.entries(queries.value || {}).map(([id, config]) => ({
      id,
      label: config?.label || id,
      config
    }))
  )

  return {
    queries,
    queryList,
    getQuery
  }
}
