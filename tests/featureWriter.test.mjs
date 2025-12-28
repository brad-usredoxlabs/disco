import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { writeFeatureConcept, writeFeatureRevision, rebuildFeatureIndex } from '../src/vocab/featureWriter.js'

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

describe('featureWriter', () => {
  let tmpRoot
  let repo

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'features-test-'))
    repo = createRepo(tmpRoot)
    await fs.mkdir(path.join(tmpRoot, 'vocab', 'features'), { recursive: true })
    await fs.mkdir(path.join(tmpRoot, 'vocab', 'feature-revisions'), { recursive: true })
  })

  afterAll(async () => {
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true })
  })

  it('writes concept/revision with label-based slug and underscores', async () => {
    const entry = {
      id: 'feature:ROS Proxy',
      label: 'ROS Proxy',
      tags: ['ros'],
      description: 'Reactive oxygen proxy'
    }
    const ts = '20250101T000000Z'
    const conceptResult = await writeFeatureConcept(repo, entry, { timestamp: ts })
    const revisionResult = await writeFeatureRevision(repo, entry, { timestamp: ts, createdBy: 'tester' })

    expect(conceptResult.filePath).toContain('feature--ros_proxy.yaml')
    expect(conceptResult.concept.id).toBe('feature:ros_proxy')
    expect(revisionResult.filePath).toContain('featurerev--ros_proxy--')
    expect(revisionResult.revision.of_feature).toBe('feature:ros_proxy')
  })

  it('throws when concept file already exists for the same label', async () => {
    const entry = { label: 'Duplicate Feature', tags: [], description: '' }
    await writeFeatureConcept(repo, entry, { timestamp: '20250101T000000Z' })
    await expect(writeFeatureConcept(repo, entry, { timestamp: '20250101T000001Z' })).rejects.toThrow(
      /already exists/i
    )
  })

  it('rebuilds index using normalized ids', async () => {
    const entry = { label: 'Indexed Feature', tags: [] }
    await writeFeatureConcept(repo, entry, { timestamp: '20250102T000000Z' })
    await writeFeatureRevision(repo, entry, { timestamp: '20250102T000000Z', createdBy: 'tester' })
    const index = await rebuildFeatureIndex(repo)
    expect(index.some((row) => row.id === 'feature:indexed_feature')).toBe(true)
  })
})
