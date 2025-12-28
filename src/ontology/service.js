import { createVocabStore } from './vocabStore'
import { createOlsClient } from './olsClient'

let repoConnectionRef = null
let vocabStore = null
let vocabSchemas = {}
let olsClient = null
let cacheSettings = { cacheDuration: 30 }

export function configureOntologyService({ repoConnection, systemConfig, vocabSchemas: schemas } = {}) {
  repoConnectionRef = repoConnection || null
  vocabStore = repoConnection ? createVocabStore(repoConnection) : null
  vocabSchemas = schemas || {}
  cacheSettings = {
    cacheDuration: Number(systemConfig?.cacheDuration ?? systemConfig?.cache_duration ?? 30) || 30
  }
  olsClient = createOlsClient()
}

function getVocabSchema(name) {
  if (!name) return null
  const exact = vocabSchemas?.[name]
  return exact || null
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
  const definitionValue = Array.isArray(term.definition) ? term.definition[0] : term.definition || ''
  const ontologyValue = term.ontology || term.source || source
  return {
    id: term.id || term['@id'] || term.prefLabel || '',
    label: term.label || term.prefLabel || term.name || term.id || '',
    source: ontologyValue,
    ontology: ontologyValue,
    definition: stripHtml(definitionValue),
    synonyms: term.synonyms || term.synonym || [],
    domain: term.domain || term.raw?.domain || '',
    role: term.role || term.raw?.role || '',
    raw: term
  }
}

function stripHtml(value) {
  if (!value || typeof value !== 'string') return ''
  const withoutTags = value.replace(/<[^>]*>/g, ' ')
  return withoutTags.replace(/\s+/g, ' ').trim()
}

export async function searchOntologyTerms(vocabName, query = '', options = {}) {
  console.log('[OntologyService] searchOntologyTerms', { 
    vocabName, 
    query, 
    options,
    hasVocabStore: !!vocabStore,
    hasRepo: !!repoConnectionRef,
    vocabSchemas: Object.keys(vocabSchemas)
  })
  
  const trimmed = query.trim()
  const skipLocal = options?.skipLocal === true
  if (!vocabName) return []
  if (!vocabStore || !repoConnectionRef) {
    throw new Error('Connect a repository and load a schema bundle to enable ontology searches.')
  }
  const schema = getVocabSchema(vocabName) || buildFallbackSchema(vocabName)
  const normalizedOptions = normalizeSearchOptions(options)
  const resultsMap = new Map()
  const localMaterialsResults = []

  // Priority 1: Local materials from options (e.g., material library in Run Editor)
  if (options?.localMaterials && Array.isArray(options.localMaterials) && !skipLocal) {
    options.localMaterials.forEach((entry) => {
      const normalized = annotateOntology(normalizeTerm(entry, 'local'), schema)
      if (!normalized?.id) return
      if (matchesQuery(normalized, trimmed) && matchesContext(normalized, normalizedOptions)) {
        localMaterialsResults.push({ ...normalized, provenance: 'local_library' })
        resultsMap.set(normalized.id, { ...normalized, provenance: 'local_library' })
      }
    })
  }

  const vocab = await readVocab(vocabName)
  if (!vocab) {
    throw new Error(`Unable to read vocabulary file for "${vocabName}".`)
  }
  // Allow missing vocab files (e.g., materials.yaml) when concept/revision registries are used instead
  // The vocab object will have empty local_extensions and cached_terms arrays, which is fine
  if (vocab.__missing) {
    console.warn(
      `[OntologyService] Vocabulary file missing at /vocab/${vocabName}.yaml - proceeding with OLS search only`
    )
  }

  // Priority 2: Vocab file entries
  if (vocab && !skipLocal) {
    ;[...(vocab.local_extensions || []), ...(vocab.cached_terms || [])].forEach((entry) => {
      const normalized = annotateOntology(normalizeTerm(entry, entry.source || 'local'), schema)
      if (!normalized?.id) return
      if (matchesQuery(normalized, trimmed) && matchesContext(normalized, normalizedOptions)) {
        if (!resultsMap.has(normalized.id)) {
          resultsMap.set(normalized.id, { ...normalized, provenance: 'local' })
        }
      }
    })
  }

  if (schema && trimmed.length) {
    if (skipLocal && !olsClient) {
      throw new Error('Ontology search unavailable (OLS client missing).')
    }
    const ontologyList = selectOntologyList(schema, normalizedOptions)
    if (ontologyList) {
      const baseParams = {
        ontologies: ontologyList,
        rows: schema.search_settings?.rows || 20,
        exact: schema.search_settings?.require_exact_match ?? false
      }
      try {
        let response = await olsClient.searchTerms({
          ...baseParams,
          q: trimmed
        })
        let collection = response?.collection || []
        // If no hits, retry with wildcard infix search
        if (!collection.length && trimmed.length >= 3) {
          const wildcard = trimmed.includes('*') ? trimmed : `*${trimmed}*`
          response = await olsClient.searchTerms({
            ...baseParams,
            q: wildcard
          })
          collection = response?.collection || []
        }

        collection.forEach((item) => {
          const normalized = annotateOntology(normalizeTerm(item, item.ontology || 'ontology'), schema)
          if (!normalized?.id) return
          if (!matchesContext(normalized, normalizedOptions)) return
          if (!resultsMap.has(normalized.id)) {
            resultsMap.set(normalized.id, { ...normalized, provenance: 'ols' })
          }
        })
      } catch (err) {
        console.warn('[TapTab] OLS search failed', err)
        if (skipLocal) {
          throw err
        }
      }
    }
  }

  // Return results with local materials first
  const olsAndVocabResults = Array.from(resultsMap.values()).filter(
    (result) => result.provenance !== 'local_library'
  )
  return [...localMaterialsResults, ...olsAndVocabResults]
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

function normalizeSearchOptions(options = {}) {
  const domain = options.domain ? String(options.domain).toLowerCase().trim() : ''
  const ontologyInput = options.ontology || options.ontologyEnum || ''
  const ontology = ontologyInput ? String(ontologyInput).toLowerCase().trim() : ''
  return { domain, ontology }
}

function matchesContext(term, options = {}) {
  if (!term) return false
  const domainValue = term.domain ? String(term.domain).toLowerCase() : ''
  const ontologyValue = term.ontologyEnum
    ? String(term.ontologyEnum).toLowerCase()
    : term.ontology
    ? String(term.ontology).toLowerCase()
    : term.source
    ? String(term.source).toLowerCase()
    : ''
  const domainMatches = !options.domain || !domainValue || domainValue === options.domain
  const ontologyMatches = !options.ontology || !ontologyValue || ontologyValue === options.ontology
  return domainMatches && ontologyMatches
}

function selectOntologyList(schema, options = {}) {
  const entries = schema?.bioportal_ontologies || []
  if (!entries.length) return ''
  const filtered = entries.filter((entry) => ontologyEntryMatchesFilters(entry, options))
  const target = filtered.length ? filtered : entries
  return target
    .map((entry) => normalizeOntologyAcronym(entry.acronym))
    .filter(Boolean)
    .join(',')
}

function ontologyEntryMatchesFilters(entry, options = {}) {
  if (!options.domain && !options.ontology) return true
  const domains = Array.isArray(entry?.matches?.domains)
    ? entry.matches.domains.map((value) => value.toLowerCase())
    : null
  const enumValue = entry?.matches?.ontology_enum ? entry.matches.ontology_enum.toLowerCase() : ''
  const domainMatches = !options.domain || !domains || domains.includes(options.domain)
  const ontologyMatches = !options.ontology || !enumValue || enumValue === options.ontology
  return domainMatches && ontologyMatches
}

function annotateOntology(term, schema) {
  if (!term) return term
  const resolved = resolveOntologyEnum(schema, term.ontology || term.source || '')
  if (resolved) {
    term.ontologyEnum = resolved
  }
  return term
}

function resolveOntologyEnum(schema, value) {
  if (!value) return ''
  const normalized = normalizeOntologyAcronym(value)
  if (!normalized) return ''
  const entries = schema?.bioportal_ontologies || []
  for (const entry of entries) {
    const acronym = normalizeOntologyAcronym(entry.acronym)
    const enumValue = entry.matches?.ontology_enum ? entry.matches.ontology_enum.toLowerCase() : ''
    if (enumValue) {
      if (normalized === enumValue || normalized === acronym) {
        return entry.matches.ontology_enum
      }
    } else if (acronym && normalized === acronym) {
      return entry.acronym
    }
  }
  return normalized
}

function normalizeOntologyAcronym(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function buildFallbackSchema(name) {
  if (!name) return null
  // Minimal schema so OLS search still works even if bundle is missing the vocab schema
  return {
    name,
    bioportal_ontologies: [
      { acronym: 'chebi' },
      { acronym: 'ncit' },
      { acronym: 'ncbitaxon' },
      { acronym: 'go' },
      { acronym: 'uberon' },
      { acronym: 'cl' }
    ],
    search_settings: {
      require_exact_match: false,
      include_obsolete: false,
      include_properties: true,
      include_definitions: true
    }
  }
}

export async function saveOntologySelection(vocabName, term) {
  if (!vocabStore || !vocabName || !term?.id) return
  try {
    await vocabStore.upsertCachedTerm(vocabName, term, { maxAgeDays: cacheSettings.cacheDuration })
  } catch (err) {
    console.warn('[TapTab] Failed to cache ontology term', err)
  }
}

export function getOntologyVocabSchemas() {
  return vocabSchemas
}
