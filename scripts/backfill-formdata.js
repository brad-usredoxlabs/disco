#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { createInterface } from 'node:readline'
import { buildBodyDefaults, generateMarkdownView } from '../src/records/markdownView.js'

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
})

function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve))
}

async function readDirRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await readDirRecursive(full)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full)
    }
  }
  return files
}

async function loadBundle(schemaSet) {
  const manifestPath = path.join('schema', schemaSet, 'manifest.yaml')
  const manifest = YAML.parse(await fs.readFile(manifestPath, 'utf8'))
  const recordSchemas = {}
  for (const file of manifest.recordSchemas || []) {
    const recordType = file.replace(/\.schema\.yaml$/, '')
    recordSchemas[recordType] = YAML.parse(await fs.readFile(path.join('schema', schemaSet, file), 'utf8'))
  }
  const uiConfigs = {}
  for (const file of manifest.uiConfigs || []) {
    const recordType = file.replace(/\.ui\.yaml$/, '')
    uiConfigs[recordType] = YAML.parse(await fs.readFile(path.join('schema', schemaSet, file), 'utf8'))
  }
  return {
    schemaSet,
    manifest,
    recordSchemas,
    uiConfigs,
    metadataFields: manifest.metadataFields || {}
  }
}

async function migrateRecord(file, bundle) {
  const content = await fs.readFile(file, 'utf8')
  if (!content.startsWith('---')) return false
  const parts = content.split(/^---$/m)
  if (parts.length < 3) return false
  const metadata = YAML.parse(parts[1]) || {}
  if (!metadata.recordType) return false
  if (metadata.formData) return false
  const defaults = buildBodyDefaults(metadata.recordType, bundle)
  metadata.formData = defaults
  const markdown = generateMarkdownView(metadata.recordType, metadata, defaults, bundle)
  const newContent = `---\n${YAML.stringify(metadata)}---\n\n${markdown}`
  await fs.writeFile(file, newContent, 'utf8')
  return true
}

async function main() {
  try {
    const schemaSet = await question('Schema bundle name (e.g., computable-lab): ')
    const bundle = await loadBundle(schemaSet.trim())
    const baseDir = await question('Records directory (e.g., 02_PROJECTS): ')
    const files = await readDirRecursive(baseDir.trim())
    let migrated = 0
    for (const file of files) {
      const changed = await migrateRecord(file, bundle)
      if (changed) migrated += 1
    }
    console.log(`Migrated ${migrated} records.`)
  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    rl.close()
  }
}

main()
