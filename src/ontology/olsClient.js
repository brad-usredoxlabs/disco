const OLS_API = 'https://www.ebi.ac.uk/ols4/api/search'
const OLS_FALLBACK_API = 'https://www.ebi.ac.uk/ols/api/search'

function buildUrl(params = {}) {
  const url = new URL(OLS_API)
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, value)
  })
  return url.toString()
}

function buildFallbackUrl(params = {}) {
  const url = new URL(OLS_FALLBACK_API)
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, value)
  })
  return url.toString()
}

function normalizeDoc(doc = {}) {
  const id = doc.obo_id || doc.short_form || doc.iri || ''
  const label = doc.label || id
  const ontology = doc.ontology_name || doc.ontology_prefix || ''
  return {
    id,
    label,
    ontology,
    definition: Array.isArray(doc.description) ? doc.description[0] : doc.description || '',
    synonyms: Array.isArray(doc.synonym) ? doc.synonym : [],
    source: 'ols'
  }
}

export function createOlsClient({ fetchImpl = fetch } = {}) {
  async function fetchWithFallback(params) {
    const urls = [buildUrl(params), buildFallbackUrl(params)]
    let lastError = null
    for (const url of urls) {
      try {
        const response = await fetchImpl(url, {
          mode: 'cors',
          redirect: 'follow',
          headers: {
            Accept: 'application/json'
          }
        })
        if (response.ok) {
          return response
        }
        // CORS + redirect issues present as opaqueredirect or 3xx without CORS headers
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
          lastError = new Error('OLS search redirected without CORS headers.')
          continue
        }
        const text = await response.text()
        lastError = new Error(`OLS request failed (${response.status}): ${text}`)
      } catch (err) {
        lastError = err
      }
    }
    throw lastError || new Error('OLS search failed.')
  }

  async function searchTerms({ q, ontologies = '', rows = 20, exact = false } = {}) {
    if (!q) return { collection: [] }
    if (typeof q === 'string' && q.length > 512) {
      throw new Error('Search query too long.')
    }
    const params = {
      q,
      ontology: ontologies,
      rows,
      exact
    }
    const response = await fetchWithFallback(params)
    const payload = await response.json()
    const docs = payload?.response?.docs || []
    return { collection: docs.map(normalizeDoc) }
  }

  return {
    searchTerms
  }
}
