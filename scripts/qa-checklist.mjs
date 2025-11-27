#!/usr/bin/env node

import { execSync } from 'node:child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

const CHECKS = [
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
