#!/usr/bin/env node

import { execSync } from 'node:child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const CHECKS = [
  {
    name: 'TapTab smoke flow',
    command: 'npm run test:smoke'
  },
  {
    name: 'Markdown form generator',
    command: 'npm run test:markdown'
  },
  {
    name: 'Search index build',
    command: 'npm run build:index'
  },
  {
    name: 'RO-Crate export',
    command: 'npm run export:rocrate'
  },
  {
    name: 'Artifact IRIs',
    command: 'npm run check:artifacts'
  },
  {
    name: 'Biology entities audit',
    command: 'npm run check:biology'
  },
  {
    name: 'JSON-LD compliance',
    command: 'npm run check:jsonld'
  },
  {
    name: 'Graph config validation',
    command: 'npm run check:graph'
  }
]

async function main() {
  const results = []
  for (const check of CHECKS) {
    try {
      execSync(check.command, { stdio: 'inherit', cwd: projectRoot })
      results.push({ name: check.name, status: 'ok' })
    } catch (err) {
      console.error(`[QA] ${check.name} failed:`, err?.message || err)
      results.push({ name: check.name, status: 'failed' })
    }
  }

  const failed = results.filter((item) => item.status !== 'ok')
  if (failed.length) {
    console.error('[QA] Checklist failed:')
    failed.forEach((item) => console.error(` - ${item.name}`))
    process.exitCode = 1
  } else {
    console.log('[QA] All checks passed.')
  }
}

main().catch((err) => {
  console.error('[QA] Unexpected failure:', err)
  process.exitCode = 1
})
