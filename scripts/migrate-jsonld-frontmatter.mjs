#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import YAML from 'yaml'
import { composeRecordFrontMatter } from '../src/records/jsonLdFrontmatter.js'
import { parseFrontMatter, serializeFrontMatter } from '../src/records/frontMatter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

async function main() {
  const args = process.argv.slice(2)
  const options = {
    dryRun: false
  }

  const cleanedArgs = []
  for (const arg of args) {
    if (arg === '--dry-run' || arg === '--dryrun') {
      options.dryRun = true
    } else {
      cleanedArgs.push(arg)
    }
  }

  const bundleName = cleanedArgs[0] || 'computable-lab'
  const manifest = await readYaml(path.join(projectRoot, 'schema', bundleName, 'manifest.yaml'))
  if (!manifest) {
    throw new Error(`Manifest not found for bundle "${bundleName}".`)
  }

  const recordSchemas = await loadSchemas(manifest.recordSchemas || [], bundleName, 'schema')
  const uiConfigs = await loadSchemas(manifest.uiConfigs || [], bundleName, 'schema')
  const metadataFields = buildMetadataFieldMap(manifest.metadataFields || {}, recordSchemas)
  const jsonLdConfig = await readYaml(path.join(projectRoot, 'schema', bundleName, 'jsonld-config.yaml'))
  if (!jsonLdConfig) {
    throw new Error(`jsonld-config.yaml missing for bundle "${bundleName}".`)
  }

  const bundle = {
    recordSchemas,
    uiConfigs,
    metadataFields,
    jsonLdConfig
  }

  const naming = await readYaml(path.join(projectRoot, 'naming', `${bundleName}.yaml`))
  if (!naming) {
    throw new Error(`Naming config missing for bundle "${bundleName}".`)
  }

  let updatedCount = 0
  const results = []

  for (const [recordType, config] of Object.entries(naming)) {
    const baseDir = config.baseDir
    if (!baseDir) continue
    const absoluteDir = path.join(projectRoot, baseDir)
    const files = await collectMarkdownFiles(absoluteDir)
    for (const filePath of files) {
      const relativePath = path.relative(projectRoot, filePath)
      const raw = await fs.readFile(filePath, 'utf8')
      if (!raw.trim().startsWith('---')) continue
      const { data, body } = parseFrontMatter(raw)
      if (data?.metadata && data?.data) {
        continue
      }
      const sourceMetadata = data || {}
      const formData = sourceMetadata.formData || {}
      const resolvedType = sourceMetadata.recordType || recordType
      const nextFrontMatter = composeRecordFrontMatter(resolvedType, sourceMetadata, formData, bundle)
      const nextContent = serializeFrontMatter(nextFrontMatter, body || '')
      if (nextContent === raw) continue
      results.push(relativePath)
      if (!options.dryRun) {
        await fs.writeFile(filePath, nextContent, 'utf8')
      }
      updatedCount += 1
    }
  }

  if (!results.length) {
    console.log('No records required migration.')
  } else if (options.dryRun) {
    console.log('Dry run complete. The following files would be updated:')
    results.forEach((file) => console.log(` - ${file}`))
    console.log(`Total pending updates: ${results.length}`)
  } else {
    console.log(`Updated ${updatedCount} record(s):`)
    results.forEach((file) => console.log(` - ${file}`))
  }
}

async function readYaml(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return YAML.parse(text)
  } catch (err) {
    return null
  }
}

async function loadSchemas(files, bundleName, baseDir) {
  const map = {}
  for (const filename of files) {
    const key = filename.replace(/\.ya?ml$/i, '').replace(/\.schema$/, '').replace(/\.ui$/, '')
    const targetPath = path.join(projectRoot, baseDir, bundleName, filename)
    const schema = await readYaml(targetPath)
    if (schema) {
      const recordType = deriveRecordType(filename)
      map[recordType] = schema
    }
  }
  return map
}

function deriveRecordType(filename) {
  return filename.replace(/\.schema\.yaml$/i, '').replace(/\.ui\.yaml$/i, '')
}

function buildMetadataFieldMap(config = {}, recordSchemas = {}) {
  const map = {}
  const defaultFields = config.default || []
  Object.keys(recordSchemas).forEach((recordType) => {
    map[recordType] = config[recordType] || defaultFields
  })
  return map
}

async function collectMarkdownFiles(dir) {
  const files = []
  async function walk(current) {
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch (err) {
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

main().catch((err) => {
  console.error('[migrate-jsonld-frontmatter] Failed:', err)
  process.exitCode = 1
})
