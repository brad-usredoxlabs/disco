import { computed, ref, watch } from 'vue'
import { readShardCache, writeShardCache } from '../storage/cacheStore'

const INDEX_MANIFEST_PATH = '/index/manifest.json'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 // 24 hours

export function useSearchIndex(recordGraph) {
  const query = ref('')
  const results = ref([])
  const isIndexing = ref(false)
  const error = ref('')
  const index = ref([])
  const source = ref('shards')
  const filters = ref(initialFilters())
  const facetOptions = ref(buildEmptyFacets())
  const hasActiveFilters = computed(() => Object.values(filters.value).some(Boolean))

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
      text: doc.text || '',
      taxonId: doc.taxonId || '',
      taxonLabel: doc.taxonLabel || '',
      anatomicalContextId: doc.anatomicalContextId || '',
      anatomicalContextLabel: doc.anatomicalContextLabel || '',
      pathwayIds: Array.isArray(doc.pathwayIds) ? doc.pathwayIds : [],
      pathwayLabels: Array.isArray(doc.pathwayLabels) ? doc.pathwayLabels : [],
      operatorId: doc.operatorId || '',
      operatorLabel: doc.operatorLabel || '',
      plateId: doc.plateId || ''
    }))
    source.value = nextSource
    facetOptions.value = buildFacetOptions(index.value)
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

  function buildGraphDocs(graphValue = {}) {
    const nodes = graphValue?.nodes || []
    return nodes.map((node) => {
      const textParts = [node.title || '', JSON.stringify(node.frontMatter || {})]
      const text = textParts.join('\n').toLowerCase()
      return {
        id: node.id,
        path: node.path,
        title: node.title || node.id,
        recordType: node.recordType,
        snippet: '',
        text,
        taxonId: '',
        taxonLabel: '',
        anatomicalContextId: '',
        anatomicalContextLabel: '',
        pathwayIds: [],
        pathwayLabels: [],
        operatorId: '',
        operatorLabel: '',
        plateId: ''
      }
    })
  }

  function fallbackToGraph(graphValue) {
    const docs = buildGraphDocs(graphValue || recordGraph.graph?.value || recordGraph.graph || { nodes: [] })
    applyDocs(docs, 'graph')
  }

  async function useCachedShards() {
    const cached = await loadShardCache()
    if (!cached) return false
    applyDocs(cached.docs || [], 'cache')
    return true
  }

  async function rebuild() {
    isIndexing.value = true
    error.value = ''
    try {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (offline && (await useCachedShards())) {
        return
      }
      await rebuildFromShards()
      return
    } catch (err) {
      if (!(await useCachedShards())) {
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
    const tokens = q.split(/\s+/).filter(Boolean)
    const filtersActive = hasActiveFilters.value
    if (!tokens.length && !filtersActive) {
      results.value = []
      return
    }
    const matches = []
    for (const entry of index.value) {
      if (!matchesFilters(entry, filters.value)) continue
      if (tokens.length) {
        const score = tokens.reduce((acc, token) => (entry.text.includes(token) ? acc + 1 : acc), 0)
        if (score === tokens.length) {
          matches.push({ ...entry })
        }
      } else {
        matches.push({ ...entry })
      }
    }
    results.value = matches.slice(0, 50)
  }

  watch(query, () => {
    runSearch()
  })

  watch(
    () => filters.value,
    () => {
      runSearch()
    },
    { deep: true }
  )

  watch(
    () => recordGraph.graph?.value,
    (graphValue) => {
      if (!graphValue?.nodes?.length) return
       // Only fall back to graph if we don't already have shards or cached shards applied
       if (source.value === 'shards' || source.value === 'cache') return
      fallbackToGraph(graphValue)
    },
    { deep: true, immediate: true }
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
    source,
    filters,
    facetOptions,
    hasActiveFilters,
    setFilter,
    clearFilters
  }
}

function saveShardCache(manifest, docs) {
  writeShardCache({
    manifest,
    docs,
    savedAt: Date.now()
  })
}

async function loadShardCache() {
  const cached = await readShardCache()
  if (!cached?.docs || !cached.savedAt) return null
  if (Date.now() - cached.savedAt > CACHE_TTL_MS) {
    return null
  }
  return cached
}

function initialFilters() {
  return {
    recordType: '',
    taxonId: '',
    anatomicalContextId: '',
    pathwayId: '',
    operatorId: '',
    plateId: ''
  }
}

function buildEmptyFacets() {
  return {
    recordType: [],
    taxonId: [],
    anatomicalContextId: [],
    pathwayId: [],
    operatorId: [],
    plateId: []
  }
}

function buildFacetOptions(docs = []) {
  const buckets = {
    recordType: new Map(),
    taxonId: new Map(),
    anatomicalContextId: new Map(),
    pathwayId: new Map(),
    operatorId: new Map(),
    plateId: new Map()
  }
  docs.forEach((doc) => {
    addFacet(buckets.recordType, doc.recordType, doc.recordType || doc.recordType)
    addFacet(buckets.taxonId, doc.taxonId, doc.taxonLabel || doc.taxonId)
    addFacet(buckets.anatomicalContextId, doc.anatomicalContextId, doc.anatomicalContextLabel || doc.anatomicalContextId)
    ensureArray(doc.pathwayIds).forEach((value, index) => {
      const label = Array.isArray(doc.pathwayLabels) ? doc.pathwayLabels[index] : null
      addFacet(buckets.pathwayId, value, label || value)
    })
    addFacet(buckets.operatorId, doc.operatorId, doc.operatorLabel || doc.operatorId)
    addFacet(buckets.plateId, doc.plateId, doc.plateId)
  })
  return {
    recordType: mapToSortedList(buckets.recordType),
    taxonId: mapToSortedList(buckets.taxonId),
    anatomicalContextId: mapToSortedList(buckets.anatomicalContextId),
    pathwayId: mapToSortedList(buckets.pathwayId),
    operatorId: mapToSortedList(buckets.operatorId),
    plateId: mapToSortedList(buckets.plateId)
  }
}

function addFacet(map, value, label) {
  if (!value) return
  const key = String(value)
  if (!map.has(key)) {
    map.set(key, { value: key, label: label || key, count: 0 })
  }
  const entry = map.get(key)
  entry.count += 1
}

function mapToSortedList(map) {
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function ensureArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (!value) return []
  return [value]
}

function matchesFilters(doc, filters) {
  if (filters.recordType && doc.recordType !== filters.recordType) return false
  if (filters.taxonId && doc.taxonId !== filters.taxonId) return false
  if (filters.anatomicalContextId && doc.anatomicalContextId !== filters.anatomicalContextId) return false
  if (filters.operatorId && doc.operatorId !== filters.operatorId) return false
  if (filters.plateId && doc.plateId !== filters.plateId) return false
  if (filters.pathwayId) {
    const pathways = Array.isArray(doc.pathwayIds) ? doc.pathwayIds : []
    if (!pathways.includes(filters.pathwayId)) return false
  }
  return true
}

function setFilter(name, value) {
  if (!Object.prototype.hasOwnProperty.call(filters.value, name)) return
  filters.value = {
    ...filters.value,
    [name]: value
  }
}

function clearFilters() {
  filters.value = initialFilters()
}
