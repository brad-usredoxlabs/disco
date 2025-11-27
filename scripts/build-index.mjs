#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import YAML from 'yaml'
import { parseFrontMatter } from '../src/records/frontMatter.js'
import {
  extractRecordData,
  composeRecordFrontMatter,
  mergeMetadataAndFormData
} from '../src/records/jsonLdFrontmatter.js'
import { buildZodSchema } from '../src/records/zodBuilder.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

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
        docs.push(result)
      }
    }
  }

  docs.sort((a, b) => a.id.localeCompare(b.id))
  await writeShards(docs, bundleName)
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
  const jsonLdNode = mergeJsonLdNode(normalizedFrontMatter)
  const indexDoc = buildIndexDoc({
    jsonLdNode,
    recordType,
    schemaPayload,
    relativePath,
    body
  })
  return indexDoc
}

function mergeJsonLdNode(frontMatter) {
  const metadata = frontMatter.metadata || {}
  const dataSections = frontMatter.data || {}
  const node = { ...metadata }
  Object.values(dataSections).forEach((section) => {
    if (!section || typeof section !== 'object') return
    Object.entries(section).forEach(([key, value]) => {
      if (value === undefined) return
      node[key] = value
    })
  })
  return node
}

function buildIndexDoc({ jsonLdNode, recordType, schemaPayload, relativePath, body }) {
  const id = jsonLdNode['@id'] || schemaPayload.id || schemaPayload.recordId || `${recordType}:${relativePath}`
  const doc = {
    id,
    recordType,
    recordId: schemaPayload.id || schemaPayload.recordId || '',
    title: jsonLdNode.title || schemaPayload.title || '',
    description: jsonLdNode.description || schemaPayload.description || '',
    createdAt: jsonLdNode.createdAt || jsonLdNode.created || '',
    updatedAt: jsonLdNode.updatedAt || jsonLdNode.updated || '',
    projectId: jsonLdNode.projectId || jsonLdNode.project?.id || schemaPayload.projectId || '',
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
    path: relativePath,
    snippet: (body || '').slice(0, 240),
    text: buildSearchText(jsonLdNode, body)
  }
  return doc
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

async function loadSchemaBundle(bundleName) {
  const manifestPath = path.join(projectRoot, 'schema', bundleName, 'manifest.yaml')
  const manifest = await readYaml(manifestPath)
  if (!manifest) {
    throw new Error(`Manifest missing for bundle "${bundleName}".`)
  }
  const recordSchemas = await loadYamlMap(manifest.recordSchemas || [], bundleName, 'schema')
  const uiConfigs = await loadYamlMap(manifest.uiConfigs || [], bundleName, 'schema')
  const metadataFields = buildMetadataFieldMap(manifest.metadataFields || {}, recordSchemas)
  const bundle = {
    manifest,
    recordSchemas,
    uiConfigs,
    metadataFields
  }
  return bundle
}

async function loadYamlMap(files, bundleName, baseDir) {
  const map = {}
  for (const filename of files) {
    const recordType = deriveRecordType(filename)
    const filePath = path.join(projectRoot, baseDir, bundleName, filename)
    const yaml = await readYaml(filePath)
    if (yaml) {
      map[recordType] = yaml
    }
  }
  return map
}

function deriveRecordType(filename) {
  return filename.replace(/\.schema\.ya?ml$/i, '').replace(/\.ui\.ya?ml$/i, '').replace(/\.ya?ml$/i, '')
}

function buildMetadataFieldMap(config = {}, recordSchemas = {}) {
  const map = {}
  const defaultFields = config.default || []
  Object.keys(recordSchemas).forEach((recordType) => {
    map[recordType] = config[recordType] || defaultFields
  })
  return map
}

async function readYaml(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return YAML.parse(text)
  } catch (err) {
    return null
  }
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
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
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
