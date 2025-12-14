#!/usr/bin/env node

import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import YAML from 'yaml'
import { loadSchemaBundle, projectRoot } from './lib/loadSchemaBundle.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_BUNDLE = process.env.SCHEMA_BUNDLE

async function main() {
  const graphRoot = path.join(projectRoot, 'graph')
  const entries = await safeReadDir(graphRoot)
  if (!entries.length) {
    console.log('[check-graph] No graph configs found.')
    return
  }

  const issues = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const bundleName = entry.name
    if (DEFAULT_BUNDLE && bundleName !== DEFAULT_BUNDLE) continue
    await validateBundle(bundleName, graphRoot, issues)
  }

  if (issues.length) {
    console.error('[check-graph] Validation failed:')
    issues.forEach((issue) => console.error(` - [${issue.bundle}] ${issue.message}`))
    process.exitCode = 1
  } else {
    console.log('[check-graph] Graph views & queries look good.')
  }
}

async function validateBundle(bundleName, graphRoot, issues) {
  let bundle
  try {
    bundle = await loadSchemaBundle(bundleName)
  } catch (err) {
    issues.push({ bundle: bundleName, message: `Failed to load schema bundle: ${err?.message || err}` })
    return
  }
  const relationships = bundle.relationships?.recordTypes || {}
  const viewPath = path.join(graphRoot, bundleName, 'views.yaml')
  const queryPath = path.join(graphRoot, bundleName, 'queries.yaml')
  const views = await readConfig(viewPath)
  const queries = await readConfig(queryPath)

  if (!views?.views) {
    issues.push({ bundle: bundleName, message: 'Missing views.yaml or "views" object.' })
  } else {
    validateViews(bundleName, views.views, relationships, issues)
  }

  if (queries?.queries) {
    validateQueries(bundleName, queries.queries, relationships, issues)
  } else if (!queries) {
    issues.push({ bundle: bundleName, message: 'Missing queries.yaml or "queries" object.' })
  }
}

function validateViews(bundleName, views, relationships, issues) {
  Object.entries(views).forEach(([viewId, config]) => {
    if (!config?.rootType) {
      issues.push({ bundle: bundleName, message: `View "${viewId}" is missing rootType.` })
      return
    }
    const descriptor = relationships[config.rootType]
    if (!descriptor) {
      issues.push({ bundle: bundleName, message: `View "${viewId}" rootType "${config.rootType}" not found in relationships.` })
      return
    }
    (config.sections || []).forEach((section, index) => {
      if (!section?.edges?.length) {
        issues.push({ bundle: bundleName, message: `View "${viewId}" section #${index + 1} has no edges.` })
        return
      }
      section.edges.forEach((edge, edgeIndex) => {
        const pathValidation = validateRelationshipPath(edge.relationship, descriptor, relationships)
        if (pathValidation) {
          issues.push({
            bundle: bundleName,
            message: `View "${viewId}" edge #${edgeIndex + 1}: ${pathValidation}`
          })
        }
        if (edge.allowCreate) {
          if (typeof edge.allowCreate.recordType !== 'string' || !edge.allowCreate.recordType) {
            issues.push({
              bundle: bundleName,
              message: `View "${viewId}" edge #${edgeIndex + 1}: allowCreate.recordType is required.`
            })
          }
          if (edge.allowCreate.parentField && typeof edge.allowCreate.parentField !== 'string') {
            issues.push({
              bundle: bundleName,
              message: `View "${viewId}" edge #${edgeIndex + 1}: allowCreate.parentField must be a string.`
            })
          }
        }
      })
    })
  })
}

function validateQueries(bundleName, queries, relationships, issues) {
  Object.entries(queries).forEach(([queryId, config]) => {
    if (config.filter) {
      if (typeof config.filter.path !== 'string' || !config.filter.path.trim()) {
        issues.push({ bundle: bundleName, message: `Query "${queryId}" filter.path must be a string.` })
      }
      if (config.filter.operator && !['equals', 'contains'].includes(config.filter.operator)) {
        issues.push({
          bundle: bundleName,
          message: `Query "${queryId}" filter.operator must be "equals" or "contains".`
        })
      }
    }
    if (config.expand?.relationships) {
      config.expand.relationships.forEach((relPath, idx) => {
        const validation = validateRelationshipPathAcrossTypes(relPath, relationships)
        if (validation) {
          issues.push({
            bundle: bundleName,
            message: `Query "${queryId}" expand.relationships[${idx}]: ${validation}`
          })
        }
      })
    }
  })
}

function validateRelationshipPath(pathValue, descriptor, relationships) {
  if (typeof pathValue !== 'string' || !pathValue.includes('.')) {
    return 'relationship must be "<group>.<name>".'
  }
  const [group] = pathValue.split('.', 2)
  if (group === 'backlinks') {
    return validateBacklinkPath(pathValue, relationships)
  }
  const [, relName] = pathValue.split('.', 2)
  if (!['parents', 'children', 'related'].includes(group)) {
    return `unknown relationship group "${group}".`
  }
  const groupConfig = descriptor[group]
  if (!groupConfig) {
    return `group "${group}" not defined for this record type.`
  }
  if (!groupConfig[relName]) {
    return `relationship "${group}.${relName}" not defined for this record type.`
  }
  return null
}

function validateRelationshipPathAcrossTypes(pathValue, relationships) {
  if (typeof pathValue !== 'string' || !pathValue.includes('.')) {
    return 'relationship must be "<group>.<name>".'
  }
  const [group] = pathValue.split('.', 2)
  if (group === 'backlinks') {
    return validateBacklinkPath(pathValue, relationships)
  }
  const [, relName] = pathValue.split('.', 2)
  if (!['parents', 'children', 'related'].includes(group)) {
    return `unknown relationship group "${group}".`
  }
  const match = Object.values(relationships).some((descriptor) => descriptor?.[group]?.[relName])
  if (!match) {
    return `relationship "${group}.${relName}" not defined in any record type.`
  }
  return null
}

function validateBacklinkPath(pathValue, relationships) {
  const segments = pathValue.split('.')
  const backlinkGroup = segments[1]
  if (!['parents', 'children', 'related'].includes(backlinkGroup)) {
    return `unknown backlink group "${backlinkGroup}".`
  }
  const relName = segments[2]
  if (!relName) {
    return null
  }
  let sourceGroup = 'related'
  if (backlinkGroup === 'children') {
    sourceGroup = 'parents'
  } else if (backlinkGroup === 'parents') {
    sourceGroup = 'children'
  }
  const match = Object.values(relationships || {}).some((descriptor) => descriptor?.[sourceGroup]?.[relName])
  if (!match) {
    return `relationship "${sourceGroup}.${relName}" not defined for backlinks.`
  }
  return null
}

async function readConfig(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return YAML.parse(text)
  } catch {
    return null
  }
}

async function safeReadDir(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }
}

main().catch((err) => {
  console.error('[check-graph] Unexpected failure:', err)
  process.exitCode = 1
})
