import { createVocabStore } from './vocabStore'
import { createBioPortalClient } from './bioportalClient'

let repoConnectionRef = null
let vocabStore = null
let vocabSchemas = {}
let bioportalClient = null
let bioportalSettings = { apiKey: '', cacheDuration: 30 }

export function configureOntologyService({ repoConnection, systemConfig, vocabSchemas: schemas } = {}) {
  repoConnectionRef = repoConnection || null
  vocabStore = repoConnection ? createVocabStore(repoConnection) : null
  vocabSchemas = schemas || {}
  bioportalSettings = {
    apiKey: systemConfig?.apiKey || systemConfig?.api_key || '',
    cacheDuration: Number(systemConfig?.cacheDuration ?? systemConfig?.cache_duration ?? 30) || 30
  }
  if (repoConnectionRef && bioportalSettings.apiKey) {
    bioportalClient = createBioPortalClient({
      apiKey: bioportalSettings.apiKey,
      cacheDuration: bioportalSettings.cacheDuration,
      repoConnection: repoConnectionRef
    })
  } else if (repoConnectionRef) {
    bioportalClient = createBioPortalClient({
      apiKey: '',
      cacheDuration: bioportalSettings.cacheDuration,
      repoConnection: repoConnectionRef
    })
  } else {
    bioportalClient = null
  }
}

function getVocabSchema(name) {
  return vocabSchemas?.[name] || null
}

async function readVocab(name) {
  if (!vocabStore || !name) return null
  return vocabStore.readVocab(name)
}

function normalizeTerm(term = {}, source = 'local') {
  if (!term) return null
  if (typeof term === 'string') {
    return { id: term, label: term, source }
  }
  return {
    id: term.id || term['@id'] || term.prefLabel || '',
    label: term.label || term.prefLabel || term.name || term.id || '',
    source: term.source || term.ontology || source,
    definition: Array.isArray(term.definition) ? term.definition[0] : term.definition || '',
    synonyms: term.synonyms || term.synonym || [],
    raw: term
  }
}

export async function searchOntologyTerms(vocabName, query = '') {
  console.log('[OntologyService] searchOntologyTerms', { 
    vocabName, 
    query, 
    hasVocabStore: !!vocabStore,
    hasRepo: !!repoConnectionRef,
    vocabSchemas: Object.keys(vocabSchemas)
  })
  
  const trimmed = query.trim()
  if (!vocabName) return []
  if (!vocabStore || !repoConnectionRef) {
    throw new Error('Connect a repository and load a schema bundle to enable ontology searches.')
  }
  const schema = getVocabSchema(vocabName)
  const resultsMap = new Map()

  const vocab = await readVocab(vocabName)
  if (!vocab) {
    throw new Error(`Unable to read vocabulary file for "${vocabName}".`)
  }
  if (vocab.__missing) {
    throw new Error(`Missing vocabulary file at /vocab/${vocabName}.yaml in the selected repository.`)
  }

  if (vocab) {
    [...(vocab.local_extensions || []), ...(vocab.cached_terms || [])].forEach((entry) => {
      const normalized = normalizeTerm(entry, entry.source || 'local')
      if (!normalized?.id) return
      if (matchesQuery(normalized, trimmed)) {
        resultsMap.set(normalized.id, { ...normalized, provenance: 'local' })
      }
    })
  }

  if (schema && bioportalClient && trimmed.length) {
    const ontologyList = schema.bioportal_ontologies?.map((entry) => entry.acronym).filter(Boolean).join(',')
    if (ontologyList) {
      try {
        const payload = await bioportalClient.searchTerms({
          q: trimmed,
          ontologies: ontologyList,
          require_exact_match: schema.search_settings?.require_exact_match ?? false,
          include_obsolete: schema.search_settings?.include_obsolete ?? false,
          also_search_properties: schema.search_settings?.include_properties ?? true,
          include_definitions: schema.search_settings?.include_definitions ?? true,
          suggest: true
        })
        const collection = payload?.collection || []
        collection.forEach((item) => {
          const normalized = normalizeTerm(item, item.ontology || 'ontology')
          if (!normalized?.id) return
          if (!resultsMap.has(normalized.id)) {
            resultsMap.set(normalized.id, { ...normalized, provenance: 'bioportal' })
          }
        })
      } catch (err) {
        console.warn('[TapTab] BioPortal search failed', err)
      }
    }
  }

  return Array.from(resultsMap.values())
}

function matchesQuery(term, query) {
  if (!query) return true
  const needle = query.toLowerCase()
  const haystacks = [term.label, term.id]
  const synonyms = Array.isArray(term.synonyms) ? term.synonyms : term.raw?.synonym
  if (Array.isArray(synonyms)) {
    haystacks.push(...synonyms)
  }
  return haystacks.filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
}

export async function saveOntologySelection(vocabName, term) {
  if (!vocabStore || !vocabName || !term?.id) return
  try {
    await vocabStore.upsertCachedTerm(vocabName, term, { maxAgeDays: bioportalSettings.cacheDuration })
  } catch (err) {
    console.warn('[TapTab] Failed to cache ontology term', err)
  }
}

export function getOntologyVocabSchemas() {
  return vocabSchemas
}
