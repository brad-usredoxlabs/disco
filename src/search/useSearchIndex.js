import { computed, ref, watch } from 'vue'

const INDEX_MANIFEST_PATH = '/index/manifest.json'
const SHARD_CACHE_KEY = 'disco-shard-cache'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 // 24 hours

export function useSearchIndex(recordGraph) {
  const query = ref('')
  const results = ref([])
  const isIndexing = ref(false)
  const error = ref('')
  const index = ref([])
  const source = ref('shards')

  async function loadManifest() {
    try {
      const response = await fetch(INDEX_MANIFEST_PATH, { cache: 'no-store' })
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }

  async function loadShards(manifest) {
    if (!manifest?.files?.length) return []
    const docs = []
    for (const filename of manifest.files) {
      try {
        const response = await fetch(`/index/${filename}`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Failed to load ${filename} (${response.status})`)
        }
        const payload = await response.json()
        docs.push(...(payload.docs || []))
      } catch (err) {
        throw new Error(`Unable to load search shard ${filename}: ${err.message || err}`)
      }
    }
    return docs
  }

  function applyDocs(docs, nextSource) {
    index.value = docs.map((doc) => ({
      id: doc.id,
      path: doc.path,
      title: doc.title || doc.id,
      recordType: doc.recordType || '',
      snippet: doc.snippet || '',
      text: doc.text || ''
    }))
    source.value = nextSource
    runSearch()
  }

  async function rebuildFromShards() {
    const manifest = await loadManifest()
    if (!manifest || !manifest.files?.length) {
      throw new Error('No search shards available. Run npm run build:index.')
    }
    const docs = await loadShards(manifest)
    saveShardCache(manifest, docs)
    applyDocs(docs, 'shards')
  }

  function fallbackToGraph() {
    const graphValue = recordGraph.graph?.value || recordGraph.graph || { nodes: [] }
    const nodes = graphValue.nodes || []
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
    source.value = 'graph'
    runSearch()
  }

  function useCachedShards() {
    const cached = loadShardCache()
    if (!cached) return false
    applyDocs(cached.docs || [], 'cache')
    return true
  }

  async function rebuild() {
    isIndexing.value = true
    error.value = ''
    try {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline && useCachedShards()) {
        return
      }
      await rebuildFromShards()
      return
    } catch (err) {
      if (!useCachedShards()) {
        error.value = err?.message || 'Unable to load search index from shards. Falling back to local graph.'
        fallbackToGraph()
      } else {
        error.value = err?.message || 'Loaded cached search shards (offline).'
      }
    } finally {
      isIndexing.value = false
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

  watch(query, () => {
    runSearch()
  })

  watch(
    () => recordGraph.graph?.value,
    () => {
      if (source.value === 'graph') {
        fallbackToGraph()
      }
    }
  )

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
    rebuild,
    source
  }
}

function saveShardCache(manifest, docs) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const payload = {
      savedAt: Date.now(),
      manifest,
      docs
    }
    window.localStorage?.setItem(SHARD_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

function loadShardCache() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(SHARD_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.docs || !parsed.savedAt) return null
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(SHARD_CACHE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}
