import { buildFieldDescriptors } from './markdownView.js'
import {
  normalizeOntologyListEntry,
  normalizeOntologyListValue,
  normalizeOntologyValue,
  normalizeRecipeValue
} from './fieldNormalization.js'

export const DEFAULT_JSON_LD_CONTEXT = Object.freeze({
  ex: 'https://example.org/schema/',
  schema: 'http://schema.org/',
  ncbitaxon: 'http://purl.obolibrary.org/obo/NCBITaxon_',
  uberon: 'http://purl.obolibrary.org/obo/UBERON_',
  cl: 'http://purl.obolibrary.org/obo/CL_',
  pato: 'http://purl.obolibrary.org/obo/PATO_',
  reactome: 'http://purl.obolibrary.org/obo/REACT_'
})

const DEFAULT_DATA_SECTION = 'operations'

export function composeRecordFrontMatter(recordType, metadataInput = {}, formDataInput = {}, bundle = {}, projectOverrides = {}) {
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

  const dataSections = {}
  descriptors.body.forEach((descriptor) => {
    const source =
      Object.prototype.hasOwnProperty.call(resolvedFormData, descriptor.name) && resolvedFormData[descriptor.name] !== undefined
        ? resolvedFormData
        : metadataInput
    const rawValue = source?.[descriptor.name]
    if (rawValue === undefined) return
    const normalized = normalizeValueForDescriptor(descriptor, rawValue)
    if (normalized === undefined) return
    assignDataValue(dataSections, descriptor, normalized)
  })

  const normalizedMetadata = normalizeMetadataSection(
    resolvedRecordType,
    metadataSection,
    bundle,
    projectOverrides,
    formDataInput
  )
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
    formData[descriptor.name] = cloneValue(value)
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

function normalizeMetadataSection(recordType, metadataSection = {}, bundle = {}, projectOverrides = {}, formData = {}) {
  const next = cloneValue(metadataSection) || {}
  const typeValue = next.recordType || recordType || next.type || ''
  if (typeValue && !next.recordType) {
    next.recordType = typeValue
  }
  if (!next.recordId && next.id) {
    next.recordId = next.id
  }
  const jsonLdConfig = bundle?.jsonLdConfig || {}
  const contextPrefixes = computeContextPrefixes(projectOverrides, bundle)
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

function computeContextPrefixes(metadataSection, bundle = {}) {
  const basePrefixes = { ...DEFAULT_JSON_LD_CONTEXT, ...(bundle?.jsonLdConfig?.prefixes || {}) }
  const overrides = bundle?.projectContextOverrides || {}
  const merged = { ...basePrefixes, ...(overrides.prefixes || {}) }
  return merged
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
  if (value === undefined) return undefined
  if (descriptor.fieldType === 'ontology') {
    return normalizeOntologyValue(value)
  }
  if (descriptor.fieldType === 'ontologyList') {
    if (Array.isArray(value)) {
      return normalizeOntologyListValue(value, { columns: descriptor.columns || [] })
    }
    const normalized = normalizeOntologyListEntry(value, { columns: descriptor.columns || [] })
    return normalized ? [normalized] : []
  }
  if (descriptor.fieldType === 'recipeCard') {
    return normalizeRecipeValue(value)
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
