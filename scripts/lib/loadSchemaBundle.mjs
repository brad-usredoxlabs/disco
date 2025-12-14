import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import YAML from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.resolve(__dirname, '..', '..')

export async function loadSchemaBundle(bundleName) {
  const manifestPath = path.join(projectRoot, 'schema', bundleName, 'manifest.yaml')
  const manifest = await readYaml(manifestPath)
  if (!manifest) {
    throw new Error(`Manifest missing for bundle "${bundleName}".`)
  }
  const recordSchemas = await loadYamlMap(manifest.recordSchemas || [], bundleName, 'schema')
  const uiConfigs = await loadYamlMap(manifest.uiConfigs || [], bundleName, 'schema')
  const metadataFields = buildMetadataFieldMap(manifest.metadataFields || {}, recordSchemas)
  return {
    manifest,
    recordSchemas,
    uiConfigs,
    relationships: await readYaml(path.join(projectRoot, 'schema', bundleName, 'relationships.yaml')).catch(() => null),
    naming: await readYaml(path.join(projectRoot, 'naming', `${bundleName}.yaml`)).catch(() => null),
    assistant: manifest?.assistantConfig
      ? await readYaml(path.join(projectRoot, 'schema', bundleName, manifest.assistantConfig)).catch(() => null)
      : null,
    vocabSchemas: await loadYamlMap(manifest?.vocabSchemas || [], '', 'vocab/schema'),
    metadataFields,
    jsonLdConfig: await readYaml(path.join(projectRoot, 'schema', bundleName, 'jsonld-config.yaml')).catch(() => null)
  }
}

async function loadYamlMap(files, bundleName, baseDir) {
  const map = {}
  for (const filename of files) {
    const recordType = deriveRecordType(filename)
    const relativePath = baseDir === 'vocab/schema' ? filename : path.join(bundleName, filename)
    const filePath = path.join(projectRoot, baseDir, relativePath)
    const yaml = await readYaml(filePath)
    if (yaml) {
      map[recordType] = yaml
    }
  }
  return map
}

function deriveRecordType(filename) {
  const base = filename.split('/').pop()
  return base.replace(/\.schema\.ya?ml$/i, '').replace(/\.ui\.ya?ml$/i, '').replace(/\.ya?ml$/i, '')
}

function buildMetadataFieldMap(config = {}, recordSchemas = {}) {
  const map = {}
  const defaultFields = config.default || []
  Object.keys(recordSchemas).forEach((recordType) => {
    map[recordType] = config[recordType] || defaultFields
  })
  return map
}

export async function readYaml(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return YAML.parse(text)
  } catch (err) {
    return null
  }
}
