#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import { parseFrontMatter } from '../src/records/frontMatter.js'
import {
  extractRecordData,
  composeRecordFrontMatter,
  mergeMetadataAndFormData
} from '../src/records/jsonLdFrontmatter.js'
import { buildZodSchema } from '../src/records/zodBuilder.js'
import { loadSchemaBundle, readYaml, projectRoot } from './lib/loadSchemaBundle.mjs'
import { flattenFrontMatter } from './lib/jsonld.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_BUNDLE = process.env.SCHEMA_BUNDLE || 'computable-lab'
const MAX_DOCS_PER_SHARD = Number(process.env.MAX_DOCS_PER_SHARD || 500)

async function main() {
  const bundleName = process.argv[2] || DEFAULT_BUNDLE
  const bundle = await loadSchemaBundle(bundleName)
  const naming = await readYaml(path.join(projectRoot, 'naming', `${bundleName}.yaml`))
  if (!naming) {
    throw new Error(`Missing naming config for bundle "${bundleName}".`)
  }
  const validators = buildValidators(bundle.recordSchemas)
  const docs = []
  const jsonLdNodes = []

  for (const [recordType, config] of Object.entries(naming)) {
    if (!config?.baseDir) continue
    const dirPath = path.join(projectRoot, config.baseDir)
    const files = await collectMarkdownFiles(dirPath)
    for (const filePath of files) {
      const relativePath = path.relative(projectRoot, filePath)
      const result = await processRecord({
        filePath,
        relativePath,
        inferredType: recordType,
        bundle,
        validator: validators[recordType]
      })
      if (result) {
        if (result.doc) docs.push(result.doc)
        if (Array.isArray(result.nodes)) {
          jsonLdNodes.push(...result.nodes)
        }
      }
    }
  }

  docs.sort((a, b) => a.id.localeCompare(b.id))
  await writeShards(docs, bundleName)
  await writeJsonLdIndexes(jsonLdNodes, bundleName)
  console.log(`Indexed ${docs.length} record(s) into ${Math.max(1, Math.ceil(docs.length / MAX_DOCS_PER_SHARD))} shard(s).`)
}

async function processRecord({ filePath, relativePath, inferredType, bundle, validator }) {
  const raw = await fs.readFile(filePath, 'utf8')
  if (!raw.trim().startsWith('---')) return null
  const { data, body } = parseFrontMatter(raw)
  if (!data) return null
  const frontMatter = data
  const recordType =
    frontMatter.metadata?.recordType ||
    frontMatter.recordType ||
    frontMatter.type ||
    inferredType

  if (!recordType || recordType !== inferredType) {
    return null
  }

  const { metadata, formData } = extractRecordData(recordType, frontMatter, bundle)
  const schemaPayload = mergeMetadataAndFormData(metadata, formData)
  enforceBiologyRequirements({
    recordType,
    schemaPayload,
    relativePath,
    bundle
  })
  if (validator) {
    const schemaDef = bundle.recordSchemas?.[recordType]
    const validationInput = stripUnknownFields(schemaPayload, schemaDef)
    const result = validator.safeParse(validationInput)
    if (!result.success) {
      console.warn(`[build-index] Skipping ${relativePath} due to validation errors:`)
      result.error.issues.forEach((issue) => {
        console.warn(`  - ${issue.path.join('.') || 'root'}: ${issue.message}`)
      })
      return null
    }
  }

  const normalizedFrontMatter = composeRecordFrontMatter(recordType, schemaPayload, formData, bundle)
  const jsonLdNode = flattenFrontMatter(normalizedFrontMatter)
  if (!jsonLdNode['@id']) {
    console.warn(`[build-index] Skipping ${relativePath} because @id is missing after normalization.`)
    return null
  }
  const indexDoc = buildIndexDoc({
    jsonLdNode,
    recordType,
    schemaPayload,
    relativePath,
    body
  })
  const nodes = buildJsonLdNodes({ jsonLdNode, normalizedFrontMatter, relativePath, recordType })
  return { doc: indexDoc, nodes }
}

function enforceBiologyRequirements({ recordType, schemaPayload, relativePath, bundle }) {
  const requirements = bundle?.manifest?.biologyRequirements || {}
  if (requirements.requireProjectEntities && recordType === 'study') {
    const entities = schemaPayload?.biology?.entities
    if (!Array.isArray(entities) || entities.length === 0) {
      throw new Error(
        `[build-index] ${relativePath} is missing data.biology.entities; project records must declare at least one biological entity.`
      )
    }
  }
}

function buildIndexDoc({ jsonLdNode, recordType, schemaPayload, relativePath, body }) {
  const id = jsonLdNode['@id'] || schemaPayload.id || schemaPayload.recordId || `${recordType}:${relativePath}`
  const biologyEntities = Array.isArray(jsonLdNode.biologyEntities) ? jsonLdNode.biologyEntities : []
  const biologyDomains = biologyEntities.map((entity) => entity?.domain || '').filter(Boolean)
  const biologyRoles = biologyEntities.map((entity) => entity?.role || '').filter(Boolean)
  const biologyOntologies = biologyEntities.map((entity) => entity?.ontology || '').filter(Boolean)
  const biologyIds = biologyEntities.map((entity) => entity?.['@id'] || entity?.id || '').filter(Boolean)
  const biologyLabels = biologyEntities.map((entity) => entity?.label || '').filter(Boolean)
  const biologyText = biologyEntities
    .map((entity) =>
      [entity?.label, entity?.domain, entity?.role, entity?.['@id'] || entity?.id]
        .filter((part) => typeof part === 'string' && part.trim().length)
        .join(' ')
    )
    .filter(Boolean)
    .join(' ')
  const doc = {
    id,
    recordType,
    recordId: schemaPayload.id || schemaPayload.recordId || '',
    title: jsonLdNode.title || schemaPayload.title || '',
    description: jsonLdNode.description || schemaPayload.description || '',
    createdAt: jsonLdNode.createdAt || jsonLdNode.created || '',
    updatedAt: jsonLdNode.updatedAt || jsonLdNode.updated || '',
    projectId: jsonLdNode.studyId || jsonLdNode.study?.id || schemaPayload.studyId || '',
    plateId: jsonLdNode.plateId || '',
    runDate: jsonLdNode.runDate || jsonLdNode.startedAt || '',
    operatorLabel: pickLabel(jsonLdNode.operator),
    operatorId: pickId(jsonLdNode.operator),
    taxonId: pickId(jsonLdNode.taxon),
    taxonLabel: pickLabel(jsonLdNode.taxon),
    anatomicalContextId: pickId(jsonLdNode.anatomicalContext),
    anatomicalContextLabel: pickLabel(jsonLdNode.anatomicalContext),
    cellTypeIds: extractIds(jsonLdNode.cellTypes),
    cellTypeLabels: extractLabels(jsonLdNode.cellTypes),
    pathwayIds: extractIds(jsonLdNode.pathways),
    pathwayLabels: extractLabels(jsonLdNode.pathways),
    binaryDataFileIds: extractBinaryIds(jsonLdNode.binaryDataFiles),
    biologyEntitiesDomain: biologyDomains,
    biologyEntitiesRole: biologyRoles,
    biologyEntitiesOntology: biologyOntologies,
    biologyEntitiesId: biologyIds,
    biologyEntitiesLabel: biologyLabels,
    biologyEntitiesText: biologyText,
    path: relativePath,
    snippet: (body || '').slice(0, 240),
    text: buildSearchText(jsonLdNode, body)
  }
  return doc
}

export function buildJsonLdNodes({ jsonLdNode, normalizedFrontMatter, relativePath, recordType }) {
  const nodes = []
  nodes.push({
    ...jsonLdNode,
    recordType,
    path: relativePath
  })
  const assertions = Array.isArray(normalizedFrontMatter.assertions) ? normalizedFrontMatter.assertions : []
  assertions.forEach((assertion) => {
    if (!assertion || typeof assertion !== 'object') return
    const assertionId = assertion['@id'] || assertion.id
    if (!assertionId) return
    nodes.push({
      ...assertion,
      recordType: 'assertion',
      parent: jsonLdNode['@id'] || '',
      recordPath: relativePath
    })
  })
  return nodes
}

function buildSearchText(jsonLdNode, body = '') {
  const parts = []
  Object.entries(jsonLdNode || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(`${key}: ${value}`)
    } else if (Array.isArray(value)) {
      parts.push(`${key}: ${value.map((item) => pickLabel(item) || pickId(item) || item).join(', ')}`)
    } else if (typeof value === 'object') {
      parts.push(`${key}: ${pickLabel(value) || pickId(value) || JSON.stringify(value)}`)
    }
  })
  parts.push(body || '')
  return parts.join('\n').toLowerCase()
}

async function writeJsonLdIndexes(nodes = [], bundleName) {
  const dir = path.join(projectRoot, '_index', 'jsonld')
  await fs.mkdir(dir, { recursive: true })
  const flattenedPath = path.join(dir, 'records.flattened.jsonld')
  const compactedPath = path.join(dir, 'records.compacted.jsonld')
  const sorted = [...nodes].sort((a, b) => String(a['@id'] || a.id || '').localeCompare(String(b['@id'] || b.id || '')))
  await fs.writeFile(flattenedPath, JSON.stringify(sorted, null, 2), 'utf8')
  await fs.writeFile(compactedPath, JSON.stringify(sorted, null, 2), 'utf8')
  console.log(`[build-index] Wrote ${sorted.length} JSON-LD node(s) to ${dir} for bundle ${bundleName}.`)
}

function pickId(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.id || value['@id'] || ''
}

function pickLabel(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.label || value.prefLabel || value.name || ''
}

function extractIds(list) {
  if (!Array.isArray(list)) return []
  return list.map((entry) => pickId(entry)).filter(Boolean)
}

function extractLabels(list) {
  if (!Array.isArray(list)) return []
  return list.map((entry) => pickLabel(entry)).filter(Boolean)
}

function extractBinaryIds(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((entry) => {
      if (typeof entry === 'string') return entry
      return entry?.id || entry?.path || ''
    })
    .filter(Boolean)
}

function buildValidators(recordSchemas) {
  const validators = {}
  const context = { schemas: recordSchemas }
  for (const [recordType, schema] of Object.entries(recordSchemas || {})) {
    if (!schema) continue
    try {
      validators[recordType] = buildZodSchema(schema, context)
    } catch (err) {
      console.warn(`[build-index] Failed to build validator for ${recordType}:`, err.message)
    }
  }
  return validators
}

async function collectMarkdownFiles(dir) {
  const files = []
  async function walk(current) {
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && /\.(md|markdown|ya?ml)$/i.test(entry.name)) {
        files.push(fullPath)
      }
    }
  }
  await walk(dir)
  return files
}

async function writeShards(docs, bundleName) {
  const indexDir = path.join(projectRoot, 'index')
  await fs.mkdir(indexDir, { recursive: true })
  const shards = chunk(docs, MAX_DOCS_PER_SHARD)
  const shardFiles = []
  if (shards.length) {
    for (let i = 0; i < shards.length; i++) {
      const shardNumber = i + 1
      const filename = `index-${String(shardNumber).padStart(2, '0')}.json`
      const payload = {
        shard: shardNumber,
        totalShards: shards.length,
        docs: shards[i]
      }
      await fs.writeFile(path.join(indexDir, filename), JSON.stringify(payload, null, 2), 'utf8')
      shardFiles.push(filename)
    }
  }
  const manifest = {
    bundle: bundleName,
    docCount: docs.length,
    shardCount: shards.length,
    maxDocsPerShard: MAX_DOCS_PER_SHARD,
    generatedAt: new Date().toISOString(),
    files: shardFiles
  }
  await fs.writeFile(path.join(indexDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

function chunk(list, size) {
  if (!list.length) return []
  const chunks = []
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }
  return chunks
}

function stripUnknownFields(payload, schema) {
  if (!payload || typeof payload !== 'object') return payload
  const clone = { ...payload }
  const allowed = new Set(Object.keys(schema?.properties || {}))
  if (!allowed.size) return clone
  const result = {}
  Object.entries(clone).forEach(([key, value]) => {
    if (allowed.has(key)) {
      result[key] = value
    }
  })
  return result
}

main().catch((err) => {
  console.error('[build-index] Failed:', err)
  process.exitCode = 1
})
