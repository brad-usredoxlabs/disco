import { describe, it, expect } from 'vitest'
import { flattenFrontMatter } from '../scripts/lib/jsonld.js'
import { buildJsonLdNodes } from '../scripts/build-index.mjs'

describe('assertion indexing', () => {
  it('extracts embedded assertions as separate nodes with parent using kind', () => {
    const frontMatter = {
      metadata: { '@id': 'https://example.org/run/1', kind: 'run' },
      assertions: [
        {
          '@id': 'https://example.org/assertion/A1',
          kind: 'assertion',
          subject: { type: 'run', ref: 'https://example.org/run/1' },
          predicate: 'increases',
          object: { type: 'feature', ref: 'ex:FEAT1' },
          provenance: { asserted_by: 'user', asserted_at: '2024-01-01T00:00:00Z' }
        }
      ],
      data: {}
    }
    const jsonLdNode = flattenFrontMatter(frontMatter)
    const nodes = buildJsonLdNodes({ jsonLdNode, normalizedFrontMatter: frontMatter, relativePath: 'runs/run1.yaml', recordType: 'run' })
    const assertionNode = nodes.find((n) => n.recordType === 'assertion')
    expect(assertionNode).toBeTruthy()
    expect(assertionNode.parent).toBe('https://example.org/run/1')
    expect(assertionNode.recordPath).toBe('runs/run1.yaml')
  })
})
