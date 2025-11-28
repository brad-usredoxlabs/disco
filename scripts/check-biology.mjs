#!/usr/bin/env node

import path from 'path'
import { promises as fs } from 'fs'
import { parseFrontMatter } from '../src/records/frontMatter.js'
import { KNOWN_BIOLOGY_PREFIX_IRIS } from '../src/records/jsonLdFrontmatter.js'
import { loadSchemaBundle, projectRoot } from './lib/loadSchemaBundle.mjs'

const DOMAIN_VALUES = ['taxon', 'cell_line', 'tissue', 'pathway', 'phenotype', 'compound', 'other']
const ROLE_VALUES = [
  'sample',
  'target',
  'positive_control',
  'negative_control',
  'reference',
  'spike_in',
  'background',
  'assay_material',
  'other'
]
const ONTOLOGY_VALUES = [
  'ncbitaxon',
  'uberon',
  'cl',
  'pato',
  'reactome',
  'cellosaurus',
  'chebi',
  'go',
  'other'
]

const DEFAULT_BUNDLE = process.env.SCHEMA_BUNDLE || 'computable-lab'

async function main() {
  const bundleName = DEFAULT_BUNDLE
  const bundle = await loadSchemaBundle(bundleName)
  const naming = bundle.naming || {}
  const requireProjectEntities = Boolean(bundle.manifest?.biologyRequirements?.requireProjectEntities)
  const issues = []

  for (const [recordType, config] of Object.entries(naming || {})) {
    if (!config?.baseDir) continue
    const dirPath = path.join(projectRoot, config.baseDir)
    const files = await collectMarkdownFiles(dirPath)
    for (const filePath of files) {
      const relativePath = path.relative(projectRoot, filePath)
      const fileIssues = await validateFile(filePath, relativePath, {
        recordType,
        requireProjectEntities
      })
      if (fileIssues.length) {
        issues.push(...fileIssues)
      }
    }
  }

  if (issues.length) {
    console.error('[biology-check] Detected issues:')
    issues.forEach((issue) => {
      console.error(` - ${issue.path}: ${issue.message}`)
    })
    process.exitCode = 1
  } else {
    console.log('[biology-check] All biology entities look good.')
  }
}

async function collectMarkdownFiles(baseDir) {
  const files = []
  async function walk(current) {
    let entries = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }
  await walk(baseDir)
  return files
}

async function validateFile(filePath, relativePath, options = {}) {
  const raw = await fs.readFile(filePath, 'utf8')
  if (!raw.trim().startsWith('---')) return []
  const { data } = parseFrontMatter(raw)
  if (!data) return []

  const entities = extractBiologyEntities(data)
  const issues = []
  const hasEntities = entities.length > 0
  if (options.recordType === 'project' && options.requireProjectEntities && !hasEntities) {
    issues.push({
      path: relativePath,
      message: 'Project records must define data.biology.entities with at least one entry.'
    })
    return issues
  }
  if (!hasEntities) return issues
  const context = data.metadata?.['@context'] || data['@context'] || {}

  entities.forEach((entity, index) => {
    const prefix = entity?.ontology || ''
    const basePath = `biology.entities[${index}]`
    if (!entity || typeof entity !== 'object') {
      issues.push({ path: relativePath, message: `${basePath} is not an object` })
      return
    }
    const domain = checkRequired(entity, 'domain', basePath, relativePath, issues)
    const role = checkRequired(entity, 'role', basePath, relativePath, issues)
    const ontology = checkRequired(entity, 'ontology', basePath, relativePath, issues)
    checkRequired(entity, '@id', basePath, relativePath, issues)
    checkRequired(entity, 'label', basePath, relativePath, issues)
    checkEnum(domain, DOMAIN_VALUES, `${basePath}.domain`, relativePath, issues)
    checkEnum(role, ROLE_VALUES, `${basePath}.role`, relativePath, issues)
    checkEnum(ontology, ONTOLOGY_VALUES, `${basePath}.ontology`, relativePath, issues)
    if (prefix && prefix !== 'other') {
      if (!context || !context[prefix]) {
        if (KNOWN_BIOLOGY_PREFIX_IRIS[prefix]) {
          issues.push({
            path: relativePath,
            message: `${basePath}.ontology uses prefix "${prefix}" but @context is missing it`
          })
        } else {
          issues.push({
            path: relativePath,
            message: `${basePath}.ontology "${prefix}" is not a recognized prefix`
          })
        }
      }
    }
  })

  return issues
}

function extractBiologyEntities(frontMatter) {
  const entities = []
  const recordLevel = frontMatter?.data?.biology?.entities
  if (Array.isArray(recordLevel)) {
    entities.push(...recordLevel)
  }
  return entities
}

function checkRequired(entity, field, basePath, relativePath, issues) {
  const value = entity[field]
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ path: relativePath, message: `${basePath}.${field} is required` })
    return ''
  }
  return value.trim()
}

function checkEnum(value, allowed, fieldPath, relativePath, issues) {
  if (!value) return
  if (!allowed.includes(value)) {
    issues.push({
      path: relativePath,
      message: `${fieldPath} must be one of: ${allowed.join(', ')}`
    })
  }
}

main().catch((err) => {
  console.error('[biology-check] Unexpected error:', err)
  process.exitCode = 1
})
