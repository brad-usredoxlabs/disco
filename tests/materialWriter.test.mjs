import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { writeMaterialConcept, writeMaterialRevision, rebuildMaterialsIndex } from '../src/vocab/materialWriter.js'

function createRepo(root) {
  return {
    async writeFile(relPath, contents) {
      const filePath = path.join(root, relPath.replace(/^\//, ''))
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, contents, 'utf8')
    },
    async readFile(relPath) {
      const filePath = path.join(root, relPath.replace(/^\//, ''))
      return fs.readFile(filePath, 'utf8')
    },
    async listDir(relPath) {
      const dirPath = path.join(root, relPath.replace(/^\//, ''))
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : 'file',
        path: path.posix.join(relPath, entry.name)
      }))
    }
  }
}

describe('materialWriter', () => {
  let tmpRoot
  let repo

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'materials-test-'))
    repo = createRepo(tmpRoot)
    await fs.mkdir(path.join(tmpRoot, 'vocab', 'materials'), { recursive: true })
    await fs.mkdir(path.join(tmpRoot, 'vocab', 'material-revisions'), { recursive: true })
  })

  afterAll(async () => {
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('writes concept and revision files and builds index', async () => {
    const entry = {
      id: 'material:test',
      label: 'Test Material',
      category: 'reagent',
      experimental_intents: ['treatment'],
      tags: ['foo'],
      measures: ['feature:bar']
    }
    const ts = '20250101T000000'
    const conceptResult = await writeMaterialConcept(repo, entry, { timestamp: ts })
    const revResult = await writeMaterialRevision(repo, entry, { timestamp: ts, createdBy: 'tester' })
    expect(conceptResult.concept.id).toBe('material:test_material')
    expect(revResult.revision.id).toContain('materialrev:test_material@')

    const index = await rebuildMaterialsIndex(repo)
    expect(Array.isArray(index)).toBe(true)
    expect(index[0].id).toBe('material:test_material')
    expect(index[0].latest_revision_id).toBe(revResult.revision.id)
  })

  it('never writes to legacy materials.lab.yaml', async () => {
    const writeFile = vi.fn(async () => {})
    const repoWithSpy = {
      writeFile
    }
    await writeMaterialConcept(repoWithSpy, { label: 'Legacy label', category: 'reagent', tags: [] })
    const [pathArg] = writeFile.mock.calls[0]
    expect(pathArg).not.toContain('materials.lab.yaml')
    expect(pathArg).toContain('/vocab/materials/')
  })

  it('derives slug/id from label (not ontology id) and uses underscores', async () => {
    const entry = {
      id: 'CHEBI:3750',
      label: 'Clofibrate',
      category: 'reagent',
      tags: ['ppara']
    }
    const ts = '20251227T194138Z'
    const conceptResult = await writeMaterialConcept(repo, entry, { timestamp: ts })
    const revisionResult = await writeMaterialRevision(repo, entry, { timestamp: ts, createdBy: 'tester' })

    expect(conceptResult.filePath).toContain('material--clofibrate.yaml')
    expect(conceptResult.concept.id).toBe('material:clofibrate')
    expect(revisionResult.filePath).toContain('materialrev--clofibrate--')
    expect(revisionResult.revision.of_material).toBe('material:clofibrate')
  })

  it('throws when concept file already exists for the same label', async () => {
    const entry = {
      label: 'Duplicate',
      category: 'reagent',
      tags: []
    }
    await writeMaterialConcept(repo, entry, { timestamp: '20250101T000000Z' })
    await expect(writeMaterialConcept(repo, entry, { timestamp: '20250101T000001Z' })).rejects.toThrow(
      /already exists/i
    )
  })
})
