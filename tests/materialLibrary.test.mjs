import { describe, expect, it, vi } from 'vitest'
import { useMaterialLibrary } from '../src/plate-editor/composables/useMaterialLibrary.js'

function createRepo() {
  const readFile = vi.fn(async (path) => {
    if (path.includes('materials.lab.yaml')) {
      throw new Error('legacy path should not be read')
    }
    if (path.endsWith('materials.index.json')) {
      const err = new Error('ENOENT')
      err.code = 'ENOENT'
      throw err
    }
    if (path.endsWith('material--one.yaml')) {
      return `
id: material:one
label: One
category: reagent
tags: [foo]
`
    }
    if (path.endsWith('materialrev--one--rev.yaml')) {
      return `
id: materialrev:one@rev
of_material: material:one
revision: 1
status: active
label: One
category: reagent
experimental_intents: []
tags: [foo]
`
    }
    throw new Error(`Unexpected readFile path: ${path}`)
  })

  const listDir = vi.fn(async (dir) => {
    if (dir === '/vocab/materials') {
      return [
        { name: 'material--one.yaml', kind: 'file', path: '/vocab/materials/material--one.yaml' }
      ]
    }
    if (dir === '/vocab/material-revisions') {
      return [
        {
          name: 'materialrev--one--rev.yaml',
          kind: 'file',
          path: '/vocab/material-revisions/materialrev--one--rev.yaml'
        }
      ]
    }
    throw new Error(`Unexpected listDir path: ${dir}`)
  })

  return {
    directoryHandle: { value: {} },
    readFile,
    listDir,
    on() {},
    off() {}
  }
}

describe('useMaterialLibrary', () => {
  it('loads concepts/revisions without touching legacy materials.lab.yaml', async () => {
    const repo = createRepo()
    const library = useMaterialLibrary(repo)
    await library.reload()
    expect(repo.readFile).not.toHaveBeenCalledWith(expect.stringContaining('materials.lab.yaml'))
    expect(library.entries.value.length).toBe(1)
    expect(library.entries.value[0].id).toBe('material:one')
    expect(library.entries.value[0].latest_revision_id).toBe('materialrev:one@rev')
  })
})
