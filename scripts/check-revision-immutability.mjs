#!/usr/bin/env node

/**
 * Guard against edits to active material/feature revisions.
 * Scans staged/unstaged changes under vocab/material-revisions and vocab/feature-revisions.
 * Fails if any modified file has status: active.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

const ROOT = process.cwd()
const TARGET_DIRS = ['vocab/material-revisions', 'vocab/feature-revisions']

function getChangedFiles() {
  const args = ['git', 'diff', '--name-only', '--cached']
  const staged = safeExec(args)
  const unstaged = safeExec(['git', 'diff', '--name-only'])
  const files = new Set([...staged, ...unstaged].filter(Boolean))
  return Array.from(files).filter((file) => {
    return TARGET_DIRS.some((dir) => file.startsWith(`${dir}/`)) && file.endsWith('.yaml')
  })
}

function safeExec(cmd) {
  try {
    const out = execSync(cmd.join(' '), { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
    return out
      .toString()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function checkFile(filePath) {
  const abs = path.join(ROOT, filePath)
  const text = fs.readFileSync(abs, 'utf8')
  const parsed = YAML.parse(text) || {}
  const status = parsed.status || parsed.meta?.status || ''
  if (String(status).toLowerCase() === 'active') {
    return `Active revision is immutable: ${filePath}`
  }
  return null
}

function main() {
  const changed = getChangedFiles()
  if (!changed.length) {
    process.exit(0)
  }
  const violations = changed
    .map((file) => checkFile(file))
    .filter(Boolean)
  if (violations.length) {
    violations.forEach((msg) => console.error(msg))
    process.exitCode = 1
    return
  }
  process.exit(0)
}

main()
