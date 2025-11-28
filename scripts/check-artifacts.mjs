#!/usr/bin/env node

import path from 'path'
import { promises as fs } from 'fs'
import { loadSchemaBundle, projectRoot } from './lib/loadSchemaBundle.mjs'
import { normalizeBaseIri } from './lib/jsonld.js'

const DEFAULT_BUNDLE = process.env.SCHEMA_BUNDLE || 'computable-lab'

async function main() {
  const bundleName = process.argv[2] || DEFAULT_BUNDLE
  const bundle = await loadSchemaBundle(bundleName)
  const baseIri = normalizeBaseIri(bundle.jsonLdConfig?.baseIri || '')
  if (!baseIri) {
    throw new Error(`jsonld-config for "${bundleName}" is missing baseIri.`)
  }

  const issues = []
  issues.push(...(await checkIndexShards(baseIri)))
  issues.push(...(await checkRoCrate(baseIri)))

  if (issues.length) {
    console.error('[check-artifacts] Artifact validation failed:')
    issues.forEach((issue) => {
      console.error(` - ${issue.path}: ${issue.message}`)
    })
    process.exitCode = 1
  } else {
    console.log('[check-artifacts] Index shards and RO-Crate include derived IRIs.')
  }
}

async function checkIndexShards(baseIri) {
  const indexDir = path.join(projectRoot, 'index')
  let entries
  try {
    entries = await fs.readdir(indexDir)
  } catch {
    throw new Error('Search index directory missing. Run "npm run build:index" first.')
  }
  const shardFiles = entries.filter((name) => /^index-\d+\.json$/i.test(name))
  if (!shardFiles.length) {
    throw new Error('No shard files found. Run "npm run build:index" to generate shards.')
  }
  const issues = []
  for (const filename of shardFiles) {
    const filePath = path.join(indexDir, filename)
    let shard
    try {
      shard = JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch (err) {
      issues.push({
        path: filePath,
        message: `Unable to parse shard JSON (${err.message || err}).`
      })
      continue
    }
    const docs = Array.isArray(shard?.docs) ? shard.docs : []
    docs.forEach((doc, idx) => {
      const id = doc?.id
      if (typeof id !== 'string' || !id.startsWith(`${baseIri}/`)) {
        issues.push({
          path: filePath,
          message: `Document #${idx} missing baseIri (${baseIri}) in id.`
        })
      }
    })
  }
  return issues
}

async function checkRoCrate(baseIri) {
  const cratePath = path.join(projectRoot, 'dist', 'ro-crate', 'ro-crate-metadata.json')
  let crate
  try {
    crate = JSON.parse(await fs.readFile(cratePath, 'utf8'))
  } catch {
    throw new Error('RO-Crate metadata missing. Run "npm run export:rocrate" before this check.')
  }
  const graph = Array.isArray(crate?.['@graph']) ? crate['@graph'] : []
  if (!graph.length) {
    return [
      {
        path: cratePath,
        message: 'RO-Crate graph is empty.'
      }
    ]
  }
  const issues = []
  const datasetNode = graph.find((node) => nodeHasType(node, 'Dataset'))
  if (!datasetNode) {
    issues.push({
      path: cratePath,
      message: 'Dataset entity missing from RO-Crate graph.'
    })
  } else if ((datasetNode['@id'] || '') !== baseIri) {
    issues.push({
      path: cratePath,
      message: `Dataset @id (${datasetNode['@id'] || 'missing'}) does not match baseIri (${baseIri}).`
    })
  }

  const recordNodes = graph.filter(
    (node) => node && typeof node === 'object' && typeof node.recordType === 'string'
  )
  recordNodes.forEach((node) => {
    const id = node['@id']
    if (typeof id !== 'string' || !id.startsWith(`${baseIri}/`)) {
      issues.push({
        path: cratePath,
        message: `Record ${node.recordType || '(unknown)'} missing baseIri (${baseIri}) in @id.`
      })
    }
    if (!hasTypeValue(node['@type'])) {
      issues.push({
        path: cratePath,
        message: `Record ${node.recordType || id || '(unknown)'} missing @type entry.`
      })
    }
  })
  return issues
}

function nodeHasType(node, expected) {
  if (!node || typeof node !== 'object') return false
  return hasTypeValue(node['@type'], expected)
}

function hasTypeValue(value, expected) {
  if (!value) return false
  if (typeof value === 'string') {
    return expected ? value === expected : value.trim().length > 0
  }
  if (Array.isArray(value)) {
    if (!expected) return value.length > 0
    return value.includes(expected)
  }
  return false
}

main().catch((err) => {
  console.error('[check-artifacts] Failed:', err)
  process.exitCode = 1
})
