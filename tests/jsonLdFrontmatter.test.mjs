import { describe, it, expect } from 'vitest'
import { composeRecordFrontMatter, mergeMetadataAndFormData } from '../src/records/jsonLdFrontmatter.js'

const bundleStub = {
  recordSchemas: {
    study: {
      properties: {
        title: { type: 'string' }
      }
    }
  },
  jsonLdConfig: {
    baseIri: 'https://example.org',
    recordTypes: {
      study: { pathSegment: 'studies', classIris: ['ex:Study'] }
    },
    prefixes: { ex: 'https://example.org/schema/' }
  }
}

describe('jsonLdFrontmatter provenance handling', () => {
  it('appends system provenance and preserves existing entries', () => {
    const metadata = {
      kind: 'study',
      id: 'ST-001',
      title: 'Example',
      provenance: [{ kind: 'create', at: '2024-01-01T00:00:00Z', by: 'user1' }]
    }

    const systemProvenance = [{ kind: 'update', by: 'system' }]

    const frontMatter = composeRecordFrontMatter('study', metadata, {}, bundleStub, {}, {}, { systemProvenance })

    const entries = frontMatter.provenance
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ kind: 'create', by: 'user1' })
    expect(entries[1].kind).toBe('update')
    expect(entries[1].by).toBe('system')
    expect(entries[1].at).toBeTruthy()
  })

  it('normalizes provenance in mergeMetadataAndFormData without deleting entries', () => {
    const merged = mergeMetadataAndFormData(
      {
        kind: 'study',
        provenance: [{ kind: 'create', at: '2024-01-01T00:00:00Z', by: 'user1' }]
      },
      {}
    )

    expect(Array.isArray(merged.provenance)).toBe(true)
    expect(merged.provenance[0]).toMatchObject({ kind: 'create', by: 'user1' })
  })
})
