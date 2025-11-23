import { computed, ref, watch } from 'vue'

export function useSearchIndex(recordGraph) {
  const query = ref('')
  const results = ref([])
  const isIndexing = ref(false)
  const error = ref('')
  const index = ref([])

  function getGraph() {
    return recordGraph.graph?.value || recordGraph.graph || { nodes: [] }
  }

  async function rebuild() {
    const graphValue = getGraph()
    const nodes = graphValue.nodes || []
    if (!nodes.length) {
      index.value = []
      results.value = []
      return
    }
    isIndexing.value = true
    try {
      index.value = nodes.map((node) => {
        const textParts = [node.title || '', JSON.stringify(node.frontMatter || {}), node.markdown || '']
        const text = textParts.join('\n').toLowerCase()
        return {
          id: node.id,
          path: node.path,
          title: node.title || node.id,
          recordType: node.recordType,
          snippet: (node.markdown || '').slice(0, 200),
          text
        }
      })
      try {
        await window.localStorage.setItem('disco-search-index', JSON.stringify(index.value))
      } catch (err) {
        /* ignore */
      }
    } catch (err) {
      error.value = err?.message || 'Unable to build search index.'
    } finally {
      isIndexing.value = false
      runSearch()
    }
  }

  function runSearch() {
    const q = query.value.trim().toLowerCase()
    if (!q) {
      results.value = []
      return
    }
    const tokens = q.split(/\s+/).filter(Boolean)
    if (!tokens.length) {
      results.value = []
      return
    }
    const matches = []
    for (const entry of index.value) {
      const score = tokens.reduce((acc, token) => (entry.text.includes(token) ? acc + 1 : acc), 0)
      if (score === tokens.length) {
        matches.push({ ...entry })
      }
    }
    results.value = matches.slice(0, 50)
  }

  watch(
    () => recordGraph.graph?.value,
    () => {
      rebuild()
    },
    { immediate: true }
  )

  watch(query, () => {
    runSearch()
  })

  const hasResults = computed(() => results.value.length > 0)

  return {
    query,
    setQuery: (value) => {
      query.value = value
    },
    results,
    isIndexing,
    error,
    hasResults,
    rebuild
  }
}
