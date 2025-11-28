import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { composeRecordFrontMatter } from '../src/records/jsonLdFrontmatter.js'
import { generateMarkdownView } from '../src/records/markdownView.js'
import { serializeFrontMatter } from '../src/records/frontMatter.js'
import { loadSchemaBundle, projectRoot } from '../scripts/lib/loadSchemaBundle.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bundleName = process.env.SCHEMA_BUNDLE || 'computable-lab'
const bundle = await loadSchemaBundle(bundleName)
const smokeDir = path.join(projectRoot, '07_EXPERIMENTS')
const smokeFile = path.join(smokeDir, 'EXP-QA-SMOKE.md')

async function cleanup() {
  await fs.rm(smokeFile, { force: true })
}

function runBuildIndex() {
  execSync('node scripts/build-index.mjs', {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, SCHEMA_BUNDLE: bundleName }
  })
}

async function readShardDoc(targetId) {
  const manifestPath = path.join(projectRoot, 'index', 'manifest.json')
  const manifestRaw = await fs.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestRaw)
  const files = manifest.files || []
  for (const filename of files) {
    const shardPath = path.join(projectRoot, 'index', filename)
    const shard = JSON.parse(await fs.readFile(shardPath, 'utf8'))
    const doc = (shard.docs || []).find((entry) => entry.id === targetId)
    if (doc) return doc
  }
  return null
}

async function main() {
  await cleanup()
  await fs.mkdir(smokeDir, { recursive: true })

  const metadata = {
    recordType: 'experiment',
    recordId: 'EXP-QA-SMOKE',
    title: 'QA Smoke Experiment',
    shortSlug: 'QASM',
    projectId: 'PRJ-QA',
    protocolId: 'PR-0001',
    state: 'draft',
    description: 'Synthetic experiment created during QA smoke test.'
  }

  const formData = {
    samples: ['SAM-QA-1'],
    runs: ['RUN-QA-1'],
    plateId: 'QA-PLATE-1',
    taxon: { id: 'ncbitaxon:632', label: 'Faecalibacterium prausnitzii' },
    anatomicalContext: { id: 'uberon:0002107', label: 'liver' },
    pathways: [{ id: 'reactome:R-HSA-1430728', label: 'Metabolism of amino acids' }],
    operator: { id: 'https://example.org/person/qa', label: 'QA Bot' },
    runDate: '2025-01-10T10:00:00Z'
  }

  const frontMatter = composeRecordFrontMatter('experiment', metadata, formData, bundle)
  const markdown = generateMarkdownView('experiment', metadata, formData, bundle)
  const fileText = serializeFrontMatter(frontMatter, markdown)
  await fs.writeFile(smokeFile, fileText, 'utf8')

  try {
    runBuildIndex()
    const recordId = frontMatter.metadata['@id']
    assert.ok(recordId, 'Smoke record missing @id')
    const doc = await readShardDoc(recordId)
    assert.ok(doc, 'Smoke record missing from search shard')
    assert.equal(doc.recordType, 'experiment')
    assert.ok(doc.text.includes('qa smoke experiment'), 'Search text missing title')
    assert.ok(doc.text.includes('run-qa-1'), 'Search text missing run reference')
    console.log('[smoke] TapTab/edit/build-index flow verified.')
  } finally {
    await cleanup()
  }
}

main().catch((err) => {
  console.error('[smoke-test] Failed:', err)
  process.exitCode = 1
})
