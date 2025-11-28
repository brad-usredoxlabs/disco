#!/usr/bin/env node

import path from 'path'
import { promises as fs } from 'fs'
import { parseFrontMatter } from '../src/records/frontMatter.js'
import { loadSchemaBundle, projectRoot } from './lib/loadSchemaBundle.mjs'
import { normalizeBaseIri } from './lib/jsonld.js'

const DEFAULT_BUNDLE = process.env.SCHEMA_BUNDLE || 'computable-lab'

async function main() {
  const bundleName = process.argv[2] || DEFAULT_BUNDLE
  const bundle = await loadSchemaBundle(bundleName)
  const naming = bundle.naming
  if (!naming) {
    throw new Error(`Missing naming config for bundle "${bundleName}".`)
  }

  const jsonLdConfig = bundle.jsonLdConfig || {}
  const baseIri = normalizeBaseIri(jsonLdConfig.baseIri)
  if (!baseIri) {
    throw new Error(`jsonld-config for "${bundleName}" is missing baseIri.`)
  }

  const violations = []

  for (const [recordType, config] of Object.entries(naming)) {
    const baseDir = config?.baseDir
    if (!baseDir) continue
    const dirPath = path.join(projectRoot, baseDir)
    const files = await collectMarkdownFiles(dirPath)
    for (const filePath of files) {
      const relativePath = path.relative(projectRoot, filePath)
      const issues = await validateRecord({
        filePath,
        relativePath,
        inferredType: recordType,
        jsonLdConfig,
        baseIri
      })
      violations.push(...issues)
    }
  }

  if (violations.length) {
    console.error('[check-jsonld] Found JSON-LD violations:')
    violations.forEach((issue) => {
      console.error(` - ${issue.path}: ${issue.message}`)
    })
    process.exitCode = 1
  } else {
    console.log('[check-jsonld] All records include @context, derived IRIs, and base types.')
  }
}

async function validateRecord({ filePath, relativePath, inferredType, jsonLdConfig, baseIri }) {
  const violations = []
  const raw = await fs.readFile(filePath, 'utf8')
  if (!raw.trim().startsWith('---')) return violations
  const { data } = parseFrontMatter(raw)
  if (!data) return violations

  const metadataSection = data.metadata || data
  const resolvedType = metadataSection.recordType || metadataSection.type || inferredType || ''

  if (!hasContext(metadataSection)) {
    violations.push({
      path: relativePath,
      message: 'Missing @context object.'
    })
  }

  const idViolation = validateIri(metadataSection['@id'], baseIri)
  if (idViolation) {
    violations.push({
      path: relativePath,
      message: idViolation
    })
  }

  const typeViolation = validateBaseTypes({
    metadata: metadataSection,
    jsonLdConfig,
    recordType: resolvedType
  })
  if (typeViolation) {
    violations.push({
      path: relativePath,
      message: typeViolation
    })
  }

  return violations
}

function hasContext(metadata) {
  const context = metadata?.['@context']
  return isPlainObject(context) && Object.keys(context).length > 0
}

function validateIri(iri, baseIri) {
  if (typeof iri !== 'string' || !iri.trim()) {
    return 'Missing @id.'
  }
  const normalized = iri.trim()
  if (!normalized.startsWith(`${baseIri}/`)) {
    return `@id does not include baseIri (${baseIri}).`
  }
  return null
}

function validateBaseTypes({ metadata, jsonLdConfig, recordType }) {
  if (!recordType) return null
  const expected = jsonLdConfig?.recordTypes?.[recordType]?.classIris || []
  if (!expected.length) return null
  const actual = normalizeTypeList(metadata?.['@type'])
  const missing = expected.filter((type) => !actual.has(type))
  if (missing.length) {
    return `Missing base @type entries: ${missing.join(', ')}`
  }
  return null
}

function normalizeTypeList(value) {
  const list = new Set()
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (typeof entry === 'string' && entry.trim()) {
        list.add(entry.trim())
      }
    })
  } else if (typeof value === 'string' && value.trim()) {
    list.add(value.trim())
  }
  return list
}

async function collectMarkdownFiles(dir) {
  const files = []
  await walkDir(dir, files)
  return files
}

async function walkDir(current, files) {
  let entries
  try {
    entries = await fs.readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      await walkDir(fullPath, files)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath)
    }
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

main().catch((err) => {
  console.error('[check-jsonld] Failed:', err)
  process.exitCode = 1
})
