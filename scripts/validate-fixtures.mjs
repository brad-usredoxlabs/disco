#!/usr/bin/env node

/**
 * Validate run/fixture frontmatter against local JSON Schemas (converted to Zod).
 * Flattens frontmatter into a single object: metadata + data + data.operations.
 *
 * Usage: node scripts/validate-fixtures.mjs
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { parseFrontMatter } from '../src/records/frontMatter.js'
import { buildZodSchema } from '../src/records/zodBuilder.js'

const SCHEMA_ROOT = path.join(process.cwd(), 'schema', 'computable-lab')
async function main() {
  const targetFiles = [
    ...(await listDir('runs')),
    ...(await listDir('tmp/fixtures')).filter((p) => /\.(ya?ml)$/i.test(p))
  ]
  const schemas = await loadSchemas()
  const results = []
  for (const file of targetFiles) {
    const validation = await validateFile(file, schemas)
    results.push(validation)
  }
  const failures = results.filter((r) => !r.ok)
  results.forEach((res) => {
    if (res.ok) {
      console.log(`✅ ${res.file}`)
    } else {
      console.log(`❌ ${res.file}`)
      res.issues.forEach((issue) => console.log(`   - ${issue.path}: ${issue.message}`))
    }
  })
  if (failures.length) {
    console.error(`\nValidation failed for ${failures.length} file(s).`)
    process.exit(1)
  } else {
    console.log('\nAll fixtures/runs validated.')
  }
}

async function listDir(dir) {
  const full = path.join(process.cwd(), dir)
  try {
    const entries = await fs.readdir(full)
    return entries.filter((f) => /\.(ya?ml)$/i.test(f)).map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

async function loadSchemas() {
  const manifestPath = path.join(SCHEMA_ROOT, 'manifest.yaml')
  const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
  const manifest = YAML.parse(manifestRaw) || {}
  const recordSchemas = {}
  for (const entry of manifest.recordSchemas || []) {
    const fullPath = path.join(SCHEMA_ROOT, entry)
    const raw = await fs.readFile(fullPath, 'utf-8')
    const parsed = YAML.parse(raw)
    if (parsed) {
      const key = path.basename(entry).replace('.schema.yaml', '').replace('.yaml', '')
      recordSchemas[key] = parsed
    }
  }
  return recordSchemas
}

async function validateFile(filePath, schemas) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const { data: frontmatter } = parseFrontMatter(raw)
    const recordType =
      frontmatter?.metadata?.recordType ||
      frontmatter?.recordType ||
      frontmatter?.kind ||
      (filePath.includes('RUN') ? 'run' : '')
    if (!recordType || !schemas[recordType]) {
      return { file: filePath, ok: false, issues: [{ path: 'recordType', message: 'Unknown record type' }] }
    }
    let payload = {
      ...(frontmatter.metadata || {}),
      ...(frontmatter.data || {}),
      ...(frontmatter.data?.operations || {})
    }
    if (recordType === 'run') {
      payload = normalizeRunPayload(frontmatter)
    }
    const schema = buildZodSchema(schemas[recordType], { schemas })
    const result = schema.safeParse(payload)
    if (result.success) {
      return { file: filePath, ok: true, issues: [] }
    }
    const issues = result.error.issues.map((issue) => ({
      path: issue.path?.length ? issue.path.join('.') : 'root',
      message: issue.message
    }))
    return { file: filePath, ok: false, issues }
  } catch (err) {
    return { file: filePath, ok: false, issues: [{ path: 'file', message: err?.message || 'Read/parse error' }] }
  }
}

function normalizeRunPayload(frontmatter = {}) {
  const meta = frontmatter.metadata || {}
  const data = frontmatter.data || {}
  const ops = data.operations || {}
  const activities = Array.isArray(data.activities) ? data.activities : ops.activities || []
  const payload = {
    '@id': meta['@id'] || meta.id || meta.recordId || '',
    kind: 'run',
    label: meta.title || '',
    study: meta.study || '',
    experiment: meta.experiment || meta.experimentId || '',
    notes: ops.notes || data.notes || '',
    activities
  }
  Object.keys(payload).forEach((key) => {
    if (payload[key] === '' || payload[key] === undefined || payload[key] === null) {
      delete payload[key]
    }
  })
  return payload
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
