import { buildFieldDescriptors } from './markdownView.js'
import {
  normalizeOntologyListEntry,
  normalizeOntologyListValue,
  normalizeOntologyValue,
  normalizeRecipeValue,
  ONTOLOGY_SHAPES,
  resolveOntologyShape
} from './fieldNormalization.js'
import { mergeContextOverrides } from './biologyInheritance.js'

export const DEFAULT_JSON_LD_CONTEXT = Object.freeze({
  ex: 'https://example.org/schema/',
  schema: 'http://schema.org/',
  ncbitaxon: 'http://purl.obolibrary.org/obo/NCBITaxon_',
  uberon: 'http://purl.obolibrary.org/obo/UBERON_',
  cl: 'http://purl.obolibrary.org/obo/CL_',
  pato: 'http://purl.obolibrary.org/obo/PATO_',
  reactome: 'http://purl.obolibrary.org/obo/REACT_',
  cellosaurus: 'https://cellosaurus.org/ontology/',
  chebi: 'http://purl.obolibrary.org/obo/CHEBI_',
  go: 'http://purl.obolibrary.org/obo/GO_'
})

const DEFAULT_DATA_SECTION = 'operations'
export const KNOWN_BIOLOGY_PREFIX_IRIS = Object.freeze({
  ncbitaxon: 'http://purl.obolibrary.org/obo/NCBITaxon_',
  uberon: 'http://purl.obolibrary.org/obo/UBERON_',
  cl: 'http://purl.obolibrary.org/obo/CL_',
  pato: 'http://purl.obolibrary.org/obo/PATO_',
  reactome: 'http://purl.obolibrary.org/obo/REACT_',
  cellosaurus: 'https://cellosaurus.org/ontology/',
  chebi: 'http://purl.obolibrary.org/obo/CHEBI_',
  go: 'http://purl.obolibrary.org/obo/GO_'
})

export function composeRecordFrontMatter(recordType, metadataInput = {}, formDataInput = {}, bundle = {}, studyOverrides = {}) {
  const resolvedRecordType =
    metadataInput?.recordType || recordType || metadataInput?.record_type || metadataInput?.type || ''
  const descriptors = buildFieldDescriptors(resolvedRecordType, bundle)
  const bodyFieldNames = new Set(descriptors.body.map((descriptor) => descriptor.name))
  const metadataSection = {}

  Object.entries(metadataInput || {}).forEach(([key, value]) => {
    if (key === 'formData') return
    if (bodyFieldNames.has(key)) return
    metadataSection[key] = cloneValue(value)
  })

  const resolvedFormData = {
    ...(isPlainObject(metadataInput?.formData) ? metadataInput.formData : {}),
    ...(isPlainObject(formDataInput) ? formDataInput : {})
  }

  const combinedOverrides = mergeContextOverrides(studyOverrides || {}, metadataInput?.jsonldContextOverrides || {})
  const dataSections = {}
  descriptors.body.forEach((descriptor) => {
    const source =
      Object.prototype.hasOwnProperty.call(resolvedFormData, descriptor.name) && resolvedFormData[descriptor.name] !== undefined
        ? resolvedFormData
        : metadataInput
    const rawValue = readDescriptorValue(source, descriptor)
    if (rawValue === undefined) return
    const normalized = normalizeValueForDescriptor(descriptor, rawValue)
    if (normalized === undefined) return
    assignDataValue(dataSections, descriptor, normalized)
  })
  applyBiologyInheritance(dataSections, combinedOverrides)

  const normalizedMetadata = normalizeMetadataSection(
    resolvedRecordType,
    metadataSection,
    bundle,
    combinedOverrides,
    formDataInput
  )
  mergeRunSpecificSections(resolvedRecordType, dataSections, metadataInput, resolvedFormData)
  ensureBiologyPrefixes(normalizedMetadata, dataSections, bundle, combinedOverrides)
  return {
    metadata: normalizedMetadata,
    data: pruneEmptySections(dataSections)
  }
}

export function extractRecordData(recordType, frontMatter = {}, bundle = {}) {
  if (!frontMatter || typeof frontMatter !== 'object') {
    return {
      metadata: { recordType: recordType || '', formData: {} },
      formData: {}
    }
  }

  const hasJsonLdShape = frontMatter.metadata || frontMatter.data
  const resolvedRecordType =
    recordType || frontMatter.metadata?.recordType || frontMatter.recordType || frontMatter.type || ''

  if (!hasJsonLdShape) {
    const metadata = cloneValue(frontMatter) || {}
    const formData = isPlainObject(metadata.formData) ? cloneValue(metadata.formData) : {}
    metadata.recordType ||= resolvedRecordType
    metadata.formData = cloneValue(formData)
    return { metadata, formData }
  }

  const descriptors = buildFieldDescriptors(resolvedRecordType, bundle)
  const metadataSection = cloneValue(frontMatter.metadata || {})
  const formData = {}

  descriptors.body.forEach((descriptor) => {
    const value = readDataValue(frontMatter, descriptor)
    if (value === undefined) return
    writeDescriptorFormValue(formData, descriptor, value)
  })

  // Capture any remaining data entries that weren't mapped by descriptors.
  Object.entries(frontMatter.data || {}).forEach(([section, sectionValue]) => {
    if (!isPlainObject(sectionValue)) return
    Object.entries(sectionValue).forEach(([key, value]) => {
      if (value === undefined) return
      if (Object.prototype.hasOwnProperty.call(formData, key)) return
      formData[key] = cloneValue(value)
    })
  })

  const metadataWithFormData = {
    ...metadataSection,
    recordType: metadataSection.recordType || resolvedRecordType,
    formData: cloneValue(formData)
  }

  return {
    metadata: metadataWithFormData,
    formData
  }
}

export function mergeMetadataAndFormData(metadata = {}, explicitFormData) {
  const base = cloneValue(metadata) || {}
  const formDataSource = explicitFormData || metadata?.formData || {}
  if (isPlainObject(formDataSource)) {
    Object.entries(formDataSource).forEach(([key, value]) => {
      base[key] = cloneValue(value)
    })
  }
  delete base.formData
  return base
}

function normalizeMetadataSection(recordType, metadataSection = {}, bundle = {}, studyOverrides = {}, formData = {}) {
  const next = cloneValue(metadataSection) || {}
  const typeValue = next.recordType || recordType || next.type || ''
  if (typeValue && !next.recordType) {
    next.recordType = typeValue
  }
  if (!next.recordId && next.id) {
    next.recordId = next.id
  }
  const jsonLdConfig = bundle?.jsonLdConfig || {}
  const contextPrefixes = computeContextPrefixes(studyOverrides, bundle)
  if (!next['@context']) {
    next['@context'] = contextPrefixes
  }
  const derivedId = deriveRecordIri(next, jsonLdConfig)
  if (derivedId) {
    next['@id'] = derivedId
  }
  next['@type'] = normalizeTypesArray(next['@type'], jsonLdConfig, typeValue, formData)
  return next
}

function mergeRunSpecificSections(recordType, dataSections = {}, metadataInput = {}, resolvedFormData = {}) {
  if (recordType !== 'run') return
  const activities = pickArray(resolvedFormData.activities, metadataInput.activities, metadataInput?.data?.activities)
  if (activities) {
    dataSections.activities = cloneValue(activities)
  }
  const labwareBindings = pickObject(
    resolvedFormData.labware_bindings,
    metadataInput.labware_bindings,
    metadataInput?.data?.labware_bindings
  )
  if (labwareBindings) {
    dataSections.labware_bindings = cloneValue(labwareBindings)
  }
  const parameters = pickObject(resolvedFormData.parameters, metadataInput.parameters, metadataInput?.data?.parameters)
  if (parameters) {
    dataSections.parameters = cloneValue(parameters)
  }
}

function pickArray(...candidates) {
  for (const value of candidates) {
    if (Array.isArray(value) && value.length) {
      return value
    }
  }
  return null
}

function pickObject(...candidates) {
  for (const value of candidates) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value
    }
  }
  return null
}

function deriveRecordIri(metadata, jsonLdConfig = {}) {
  const recordType = metadata.recordType || metadata.type
  const recordId = metadata.recordId || metadata.id
  const baseIri = jsonLdConfig.baseIri
  const segment = jsonLdConfig.recordTypes?.[recordType]?.pathSegment
  if (!baseIri || !segment || !recordId) return metadata['@id']
  return `${baseIri.replace(/\/+$/, '')}/${segment}/${recordId}`
}

function normalizeTypesArray(existingValue, jsonLdConfig = {}, recordType = '', formData = {}) {
  const recordConfig = jsonLdConfig.recordTypes?.[recordType] || {}
  const baseTypes = recordConfig.classIris || []
  const typeSet = new Set()
  baseTypes.forEach((iri) => typeSet.add(iri))
  if (Array.isArray(existingValue)) {
    existingValue.forEach((entry) => {
      if (typeof entry === 'string') typeSet.add(entry)
    })
  } else if (typeof existingValue === 'string') {
    typeSet.add(existingValue)
  }
  const mappings = recordConfig.biologyTypeMappings || {}
  if (formData && typeof formData === 'object') {
    Object.entries(mappings).forEach(([field, config]) => {
      const value = formData[field]
      if (!value) return
      if (config?.target === '@type') {
        const iri = typeof value === 'string' ? value : value.identifier || value.id || ''
        if (iri) {
          typeSet.add(iri)
        }
      }
    })
  }
  return Array.from(typeSet)
}

function computeContextPrefixes(studyOverrides = {}, bundle = {}) {
  const basePrefixes = { ...DEFAULT_JSON_LD_CONTEXT, ...(bundle?.jsonLdConfig?.prefixes || {}) }
  const prefOverrides = (studyOverrides && studyOverrides.prefixes) || {}
  return { ...basePrefixes, ...prefOverrides }
}

function assignDataValue(target, descriptor, value) {
  if (value === undefined || value === null) return
  const placement = descriptor.jsonLd || {}
  if (placement.target === 'metadata') return
  const section = placement.section || DEFAULT_DATA_SECTION
  const key = placement.key || descriptor.name
  if (!target[section]) {
    target[section] = {}
  }
  target[section][key] = cloneValue(value)
}

function readDataValue(frontMatter, descriptor) {
  const placement = descriptor.jsonLd || {}
  if (placement.target === 'metadata') {
    const key = placement.key || descriptor.name
    return frontMatter.metadata?.[key]
  }
  const section = placement.section || DEFAULT_DATA_SECTION
  const key = placement.key || descriptor.name
  return frontMatter.data?.[section]?.[key]
}

function normalizeValueForDescriptor(descriptor, value) {
  if (value === undefined || value === null) return undefined
  if (descriptor.fieldType === 'ontology') {
    const shape = resolveOntologyShape(descriptor.schema, ONTOLOGY_SHAPES.TERM)
    return normalizeOntologyValue(value, { schema: descriptor.schema, shape })
  }
  if (descriptor.fieldType === 'ontologyList') {
    const config = {
      columns: descriptor.columns || [],
      schema: descriptor.schema,
      fallbackShape: ONTOLOGY_SHAPES.REFERENCE,
      shape: resolveOntologyShape(descriptor.schema, ONTOLOGY_SHAPES.REFERENCE)
    }
    if (Array.isArray(value)) {
      return normalizeOntologyListValue(value, config)
    }
    const normalized = normalizeOntologyListEntry(value, config)
    return normalized ? [normalized] : []
  }
  if (descriptor.fieldType === 'recipeCard') {
    return normalizeRecipeValue(value, descriptor.schema)
  }
  return cloneValue(value)
}

function pruneEmptySections(sections = {}) {
  const pruned = {}
  Object.entries(sections).forEach(([key, value]) => {
    if (isPlainObject(value) && Object.keys(value).length === 0) {
      return
    }
    if (value === undefined) return
    pruned[key] = value
  })
  return Object.keys(pruned).length ? pruned : {}
}

function cloneValue(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function readDescriptorValue(source = {}, descriptor = {}) {
  if (!source || typeof source !== 'object') return undefined
  if (!Object.prototype.hasOwnProperty.call(source, descriptor.name)) return undefined
  const entry = source[descriptor.name]
  if (descriptor.valuePath) {
    return readValueAtPath(entry, descriptor.valuePath)
  }
  return entry
}

function writeDescriptorFormValue(target = {}, descriptor = {}, value) {
  if (!target || typeof target !== 'object') return
  if (descriptor.valuePath) {
    const base = isPlainObject(target[descriptor.name]) ? cloneValue(target[descriptor.name]) : {}
    writeValueAtPath(base, descriptor.valuePath, cloneValue(value))
    target[descriptor.name] = base
    return
  }
  target[descriptor.name] = cloneValue(value)
}

function readValueAtPath(source, path = '') {
  if (!path) return source
  if (!source || typeof source !== 'object') return undefined
  const segments = path.split('.')
  let current = source
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined
    current = current[segment]
  }
  return current
}

function writeValueAtPath(target, path = '', value) {
  if (!path) return
  const segments = path.split('.')
  let current = target
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    if (!isPlainObject(current[segment])) {
      current[segment] = {}
    }
    current = current[segment]
  }
  current[segments.at(-1)] = value
}

function normalizeBiologyEntity(entity = {}) {
  if (!entity || typeof entity !== 'object') return null
  const id = typeof entity.id === 'string' ? entity.id.trim() : typeof entity['@id'] === 'string' ? entity['@id'].trim() : ''
  const label =
    typeof entity.label === 'string'
      ? entity.label.trim()
      : typeof entity.name === 'string'
        ? entity.name.trim()
        : id
  if (!id && !label) return null
  const source = typeof entity.source === 'string' ? entity.source.trim() : typeof entity.ontology === 'string' ? entity.ontology.trim() : ''
  const domain = typeof entity.domain === 'string' ? entity.domain.trim() : ''
  const role = typeof entity.role === 'string' ? entity.role.trim() : ''
  return {
    id: id || label,
    label,
    source,
    ontology: typeof entity.ontology === 'string' ? entity.ontology.trim() : source,
    domain,
    role
  }
}

function normalizeBiologyEntityList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => normalizeBiologyEntity(entry))
    .filter(
      (entry) =>
        entry &&
        Object.values(entry).some((token) => token !== '' && token !== null && token !== undefined)
    )
}

function biologyEntityKey(entity = {}) {
  return [
    entity.domain || '',
    entity.role || '',
    entity.ontology || entity.source || '',
    entity.id || entity['@id'] || '',
    entity.label || ''
  ].join('::')
}

function mergeBiologyEntities(local = [], inherited = []) {
  const merged = []
  const seen = new Set()
  normalizeBiologyEntityList(local).forEach((entity) => {
    const key = biologyEntityKey(entity)
    if (seen.has(key)) return
    seen.add(key)
    merged.push(entity)
  })
  normalizeBiologyEntityList(inherited).forEach((entity) => {
    const key = biologyEntityKey(entity)
    if (seen.has(key)) return
    seen.add(key)
    merged.push(entity)
  })
  return merged
}

function applyBiologyInheritance(sections = {}, studyOverrides = {}) {
  const inherited = readValueAtPath(studyOverrides, 'biology.entities')
  if (!Array.isArray(inherited) || !inherited.length) return
  const local = readValueAtPath(sections?.biology, 'entities') || []
  const merged = mergeBiologyEntities(local, inherited)
  if (!sections.biology) {
    sections.biology = {}
  }
  sections.biology.entities = merged
}

function ensureBiologyPrefixes(metadata = {}, dataSections = {}, bundle = {}, contextOverrides = {}) {
  const entities = dataSections?.biology?.entities
  if (!Array.isArray(entities) || !entities.length) return
  const context = metadata['@context'] || computeContextPrefixes(contextOverrides, bundle)
  let mutated = false
  const missing = new Set()
  entities.forEach((entity) => {
    const prefix =
      typeof entity?.ontology === 'string'
        ? entity.ontology.trim()
        : typeof entity?.source === 'string'
          ? entity.source.trim()
          : ''
    if (!prefix || prefix === 'other') return
    if (context[prefix]) return
    const iri = KNOWN_BIOLOGY_PREFIX_IRIS[prefix]
    if (iri) {
      context[prefix] = iri
      mutated = true
    } else {
      missing.add(prefix)
    }
  })
  if (mutated) {
    metadata['@context'] = context
  }
  if (missing.size && typeof console !== 'undefined' && console.warn) {
    console.warn(
      '[jsonld] Missing prefix definitions for biology ontologies:',
      Array.from(missing).join(', ')
    )
  }
}
