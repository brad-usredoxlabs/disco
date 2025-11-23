const API_BASE = 'https://data.bioontology.org'
const CACHE_PATH = '/vocab/.cache/bioportal-cache.json'

function defaultCache() {
  return {
    terms: {},
    searches: {}
  }
}

export function createBioPortalClient({ apiKey, repoConnection, cacheDuration = 30, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    console.warn('[TapTab] BioPortal client initialized without API key.')
  }
  let cacheState = null
  let cacheDirty = false

  async function ensureCache() {
    if (!repoConnection) return null
    if (cacheState) return cacheState
    try {
      const raw = await repoConnection.readFile(CACHE_PATH)
      cacheState = JSON.parse(raw) || defaultCache()
    } catch {
      cacheState = defaultCache()
    }
    return cacheState
  }

  async function persistCache() {
    if (!repoConnection || !cacheDirty || !cacheState) return
    await repoConnection.writeFile(CACHE_PATH, JSON.stringify(cacheState, null, 2))
    cacheDirty = false
  }

  function isExpired(entry) {
    if (!entry?.cached_at) return true
    const cached = new Date(entry.cached_at)
    if (Number.isNaN(cached.getTime())) return true
    const maxAgeMs = cacheDuration * 24 * 60 * 60 * 1000
    return Date.now() - cached.getTime() > maxAgeMs
  }

  async function request(path, params = {}) {
    if (!apiKey) {
      throw new Error('BioPortal API key is not configured.')
    }
    const url = new URL(`${API_BASE}${path}`)
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      url.searchParams.set(key, value)
    })
    const response = await fetchImpl(url.toString(), {
      headers: {
        Authorization: `apikey token=${apiKey}`
      }
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`BioPortal request failed (${response.status}): ${text}`)
    }
    return response.json()
  }

  async function searchTerms(params) {
    const cache = await ensureCache()
    const key = JSON.stringify(params)
    if (cache?.searches[key] && !isExpired(cache.searches[key])) {
      return cache.searches[key].payload
    }
    const result = await request('/search', params)
    if (cache) {
      cache.searches[key] = {
        cached_at: new Date().toISOString(),
        payload: result
      }
      cacheDirty = true
      persistCache()
    }
    return result
  }

  async function fetchTerm(ontology, termId) {
    const cache = await ensureCache()
    const key = `${ontology}:${termId}`
    if (cache?.terms[key] && !isExpired(cache.terms[key])) {
      return cache.terms[key].payload
    }
    const encodedId = encodeURIComponent(termId)
    const payload = await request(`/ontologies/${ontology}/classes/${encodedId}`)
    if (cache) {
      cache.terms[key] = {
        cached_at: new Date().toISOString(),
        payload
      }
      cacheDirty = true
      persistCache()
    }
    return payload
  }

  return {
    searchTerms,
    fetchTerm,
    flushCache: persistCache
  }
}
