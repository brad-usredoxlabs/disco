#!/usr/bin/env node

/**
 * Build a lightweight materials index (concept + latest active revision) for UI loading.
 */

import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

const ROOT = process.cwd()
const MATERIALS_DIR = path.join(ROOT, 'vocab', 'materials')
const REVISIONS_DIR = path.join(ROOT, 'vocab', 'material-revisions')
const OUTPUT = path.join(ROOT, 'vocab', 'materials.index.json')

function readYamlFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  return YAML.parse(text) || {}
}

function resolveLatestRevision(revisions = [], materialId = '') {
  const matches = revisions.filter((rev) => rev?.of_material === materialId && rev?.status === 'active')
  if (!matches.length) return null
  return matches.sort((a, b) => {
    const revA = Number(a.revision) || 0
    const revB = Number(b.revision) || 0
    if (revA !== revB) return revB - revA
    const tsA = Date.parse(a.created_at || '') || 0
    const tsB = Date.parse(b.created_at || '') || 0
    return tsB - tsA
  })[0]
}

function main() {
  if (!fs.existsSync(MATERIALS_DIR)) {
    console.error('Missing materials directory:', MATERIALS_DIR)
    process.exit(1)
  }
  const concepts = fs
    .readdirSync(MATERIALS_DIR)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => readYamlFile(path.join(MATERIALS_DIR, file)))
  const revisions = fs.existsSync(REVISIONS_DIR)
    ? fs
        .readdirSync(REVISIONS_DIR)
        .filter((file) => file.endsWith('.yaml'))
        .map((file) => readYamlFile(path.join(REVISIONS_DIR, file)))
    : []
  const index = concepts.map((concept) => {
    const latest = resolveLatestRevision(revisions, concept.id)
    return {
      id: concept.id,
      label: concept.label,
      category: concept.category,
      tags: concept.tags || [],
      latest_revision_id: latest?.id || '',
      latest_revision_status: latest?.status || '',
      latest_revision: latest || null
    }
  })
  fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2))
  console.log(`[materials-index] wrote ${index.length} entries to ${OUTPUT}`)
}

main()
