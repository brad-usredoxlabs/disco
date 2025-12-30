#!/usr/bin/env node

import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { parseFrontMatter, serializeFrontMatter } from '../../src/records/frontMatter.js'
import { assertionFilename } from '../../src/assertions/assertionUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

async function main() {
  const [, , ...args] = process.argv
  if (!args.length) {
    console.error('Usage: node scripts/assertions/promote-embedded-assertions.mjs <record-path>')
    process.exit(1)
  }

  const targetPath = path.resolve(projectRoot, args[0])
  const raw = await fs.readFile(targetPath, 'utf8')
  const { data, body } = parseFrontMatter(raw)
  const assertions = Array.isArray(data?.assertions) ? data.assertions : []
  if (!assertions.length) {
    console.log(`[promote-assertions] No assertions found in ${args[0]}`)
    return
  }

  const results = []
  for (const assertion of assertions) {
    if (!assertion || typeof assertion !== 'object') continue
    const id = assertion['@id'] || assertion.id
    if (!id) {
      results.push({ id: '', status: 'skipped', reason: 'missing @id' })
      continue
    }
    const filename = assertionFilename(id)
    const destPath = path.join(projectRoot, filename)
    const exists = await fileExists(destPath)
    if (exists) {
      results.push({ id, status: 'skipped', reason: 'already exists', path: filename })
      continue
    }
    await ensureDir(path.dirname(destPath))
    const content = serializeFrontMatter(assertion, '')
    await fs.writeFile(destPath, content, 'utf8')
    results.push({ id, status: 'written', path: filename })
  }

  results.forEach((res) => {
    console.log(`[promote-assertions] ${res.status}: ${res.id || '<no-id>'}${res.path ? ` -> ${res.path}` : ''}${res.reason ? ` (${res.reason})` : ''}`)
  })
}

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

main().catch((err) => {
  console.error('[promote-assertions] Failed:', err)
  process.exit(1)
})
