#!/usr/bin/env node

import path from 'path'
import { promises as fs } from 'fs'
import { buildGraphSnapshot } from '../src/graph/graphBuilder.js'
import { resolveRelationship } from '../src/graph/graphHelpers.js'
import { loadSchemaBundle, projectRoot } from '../scripts/lib/loadSchemaBundle.mjs'

async function readRecord(relativePath, recordType) {
  const filePath = path.join(projectRoot, relativePath)
  const text = await fs.readFile(filePath, 'utf8')
  return {
    path: `/${relativePath}`,
    recordType,
    text
  }
}

async function main() {
  const bundle = await loadSchemaBundle('computable-lab')
  const files = await Promise.all([
    readRecord('02_PROJECTS/PRJ-0005_GC_METABOLOMICS.md', 'project'),
    readRecord('07_EXPERIMENTS/GM_VA_VALIDATE_ASSAY.md', 'experiment'),
    readRecord('08_RUNS/RUN-0002_VA_2025-11-30.md', 'run')
  ])

  const snapshot = buildGraphSnapshot(files, bundle)
  const projectNode = snapshot.nodesById['PRJ-0005']
  const experimentNode = snapshot.nodesById['EXP-0015']
  const runNode = snapshot.nodesById['RUN-0002']

  if (!projectNode || !experimentNode || !runNode) {
    throw new Error('Failed to load sample nodes for graph test.')
  }

  const experimentsViaBacklink = resolveRelationship(snapshot, projectNode, 'backlinks.children.project')
  const runsViaBacklink = resolveRelationship(snapshot, experimentNode, 'backlinks.children.experiment')

  assert(
    experimentsViaBacklink.some((node) => node.id === experimentNode.id),
    'Expected project backlinks to include experiment EXP-0015'
  )
  assert(
    runsViaBacklink.some((node) => node.id === runNode.id),
    'Expected experiment backlinks to include run RUN-0002'
  )

  console.log('[graphBuilder] backlink relationship checks passed.')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
